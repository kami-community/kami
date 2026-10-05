/**
 * Paid promotion port. Services depend on this interface; vendor details
 * (X Ads API today) live in `lib/adapters/*`.
 */

export interface BoostRequest {
  /** The post to promote. Must be authored by `authorUserId`. */
  postId: string;
  /** Platform user id of the post's author (the campaign's connected account). */
  authorUserId: string;
  /** Total spend cap in the funding instrument's currency (e.g. 50 = $50.00). */
  totalBudget: number;
  /** Flight length in days, starting now. */
  durationDays: number;
  /** Human-readable name shown in the ads manager. */
  name: string;
}

export interface BoostReceipt {
  provider: string;
  adsAccountId: string;
  fundingInstrumentId: string;
  currency: string;
  campaignId: string;
  lineItemId: string;
  promotedPostId: string;
  startTime: string;
  endTime: string;
}

export interface PostBoostProvider {
  readonly id: string;
  /**
   * Create and activate a paid promotion for one post. Spend only starts once
   * every entity exists; on a partial failure the provider removes what it
   * created and throws an AppError whose details carry the ids it touched.
   */
  boostPost(request: BoostRequest): Promise<BoostReceipt>;
}
