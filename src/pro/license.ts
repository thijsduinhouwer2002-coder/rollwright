/**
 * Online check of a license key sold through Polar.sh. The plugin sends the key, our
 * organization id and our benefit id to Polar's public validate endpoint. Nothing else is
 * sent, and of the answer only the outcome is kept: never the name or e-mail of the buyer.
 * The request function is passed in (in the app: Obsidian's requestUrl), so tests need no network.
 */
import { requestUrl } from "obsidian";

/** Our Polar.sh organization, the License Keys benefit and the checkout page. While any of the three is empty, paid skins are "coming soon". */
export const POLAR_ORG_ID = "5f4a360c-7552-4269-a44a-4311f7f672d6";
export const POLAR_BENEFIT_ID = "344f6030-66ec-437a-8fbb-186b80a98c65";
export const BUY_URL = "https://buy.polar.sh/polar_cl_kJQ6H0U8GSNV0qMQkejM6SY4BYkU9k3SxfApH07ipIP";
/** The price on the buy button, so nobody is surprised on the checkout page. Keep it the same as on Polar. */
export const PRICE_TEXT = "$6";

export const VALIDATE_URL = "https://api.polar.sh/v1/customer-portal/license-keys/validate";
/** An active key is checked again at most this often, quietly. */
export const RECHECK_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

export interface LicenseRequest {
	url: string;
	method: string;
	contentType: string;
	body: string;
	throw: false;
}
export interface LicenseResponse {
	status: number;
	json: unknown;
}
export type RequestFunction = (request: LicenseRequest) => Promise<LicenseResponse>;

/** The only network call in the plugin. A body that is not JSON counts as an empty answer. */
export const obsidianRequest: RequestFunction = async (request) => {
	const response = await requestUrl(request);
	let json: unknown = null;
	try {
		json = response.json as unknown;
	} catch {
		json = null;
	}
	return { status: response.status, json };
};

export type LicenseOutcome = "valid" | "invalid" | "our-error" | "no-connection";

export const LICENSE_MESSAGES: Record<Exclude<LicenseOutcome, "valid">, string> = {
	invalid: "This key is not valid. If you rotated it, paste the new key from your Polar purchases.",
	"no-connection": "Could not reach Polar, try again.",
	"our-error": "Something is wrong on our side, please contact thijs@dortus.com.",
};

export interface PolarIds {
	organizationId: string;
	benefitId: string;
	buyUrl: string;
}
export const POLAR_IDS: PolarIds = { organizationId: POLAR_ORG_ID, benefitId: POLAR_BENEFIT_ID, buyUrl: BUY_URL };

/** False while payment is not arranged: then there is no buy button and no key field. */
export function paymentReady(ids: PolarIds = POLAR_IDS): boolean {
	return ids.organizationId.trim() !== "" && ids.benefitId.trim() !== "" && ids.buyUrl.trim() !== "";
}

/** Kept for the settings tab: the buy button shows only when payment is ready. */
export function shouldShowBuyButton(ids: PolarIds = POLAR_IDS): boolean {
	return paymentReady(ids);
}

/**
 * Asks Polar whether this key is ours and granted. 200 with our organization, our benefit
 * and status granted is valid; 404, or 200 for another organization or benefit, is invalid;
 * 422 means we sent something wrong; anything else, or no answer at all, is no connection.
 */
export async function validateLicense(key: string, request: RequestFunction, ids: PolarIds = POLAR_IDS): Promise<LicenseOutcome> {
	let response: LicenseResponse;
	try {
		response = await request({
			url: VALIDATE_URL,
			method: "POST",
			contentType: "application/json",
			body: JSON.stringify({ key: key.trim(), organization_id: ids.organizationId, benefit_id: ids.benefitId }),
			throw: false,
		});
	} catch {
		return "no-connection";
	}
	if (response.status === 200) {
		const answer = typeof response.json === "object" && response.json !== null ? (response.json as Record<string, unknown>) : {};
		const ours = answer.organization_id === ids.organizationId && answer.benefit_id === ids.benefitId && answer.status === "granted";
		return ours ? "valid" : "invalid";
	}
	if (response.status === 404) return "invalid";
	if (response.status === 422) return "our-error";
	return "no-connection";
}

/** True when the last check is 30 days old or more. A date in the future is never due. */
export function recheckDue(checkedAt: number, now: number): boolean {
	return checkedAt > 0 && now >= checkedAt && now - checkedAt >= RECHECK_INTERVAL_MS;
}

/** What a license field in the settings needs: the key and when it was last found valid. */
export interface LicenseState {
	licenseKey: string;
	licenseCheckedAt: number;
}

export function isLicenseActive(state: LicenseState): boolean {
	return typeof state.licenseKey === "string" && state.licenseKey.trim() !== "" &&
		typeof state.licenseCheckedAt === "number" && state.licenseCheckedAt > 0;
}

/**
 * Activate from the settings: only a valid answer unlocks, and only then is the key stored.
 * Any other outcome leaves the state as it was. Gives back the outcome.
 */
export async function activateLicense(state: LicenseState, key: string, request: RequestFunction, now: number, ids: PolarIds = POLAR_IDS): Promise<LicenseOutcome> {
	const outcome = await validateLicense(key, request, ids);
	if (outcome === "valid") {
		state.licenseKey = key.trim();
		state.licenseCheckedAt = now;
	}
	return outcome;
}

/**
 * The quiet check of an active key, at most once per 30 days. Only "invalid" takes the key
 * away; no connection or our own error keeps it active. Gives back whether the state changed.
 */
export async function recheckLicense(state: LicenseState, request: RequestFunction, now: number, ids: PolarIds = POLAR_IDS): Promise<boolean> {
	if (!paymentReady(ids) || !isLicenseActive(state)) return false;
	// The clock went back: start the 30 days from now, without asking Polar.
	if (state.licenseCheckedAt > now) {
		state.licenseCheckedAt = now;
		return true;
	}
	if (!recheckDue(state.licenseCheckedAt, now)) return false;
	const outcome = await validateLicense(state.licenseKey, request, ids);
	if (outcome === "valid") state.licenseCheckedAt = now;
	else if (outcome === "invalid") state.licenseCheckedAt = 0;
	else return false;
	return true;
}
