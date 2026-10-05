# Marketing credentials — step by step (free vs paid)

Fill `web/.env.local`. **Never paste secrets into chat** — only confirm which vars are set.

Also apply migration `web/supabase/migrations/005_connected_accounts_session.sql` in Supabase (adds `session_id` + `claim_id` on `connected_accounts`).

---

## Mental model (send-as-user)

| Kind of key | Whose identity? | Used for |
|-------------|-----------------|----------|
| `X_CLIENT_ID` / `INSTAGRAM_APP_ID` | **Kami the app** | OAuth login screens |
| User OAuth token (stored in `connected_accounts`) | **End user** who clicked Log in | Posts, DMs, listing their tweets |
| `APIFY_API_TOKEN` | **Kami** | Finding IG creators only (never sends) |
| `X_ADS_*` | Ads account | Paid boosts (optional) |

After login, accounts are bound to a browser `kami_claim` cookie, then claimed onto the campaign `agent_sessions` row when you hit Begin. Sends require that session’s token — not “latest global account.”

---

## Already typically set

- [x] `X_CLIENT_ID` / `X_CLIENT_SECRET` / `X_REDIRECT_URI`
- [x] Hermes, Supabase, Linkup

---

## A. X — user login (required to send as the user on X)

**Pay?** App creation is **free**. Recent search + DMs usually need **X API Basic (~$100/mo)** or higher. Check your project access at [developer.x.com](https://developer.x.com).

1. Open [developer.x.com](https://developer.x.com) → your Project → App  
2. **User authentication settings** → OAuth 2.0  
3. Callback URL (must match env exactly):  
   - Local (Community Edition default): `http://localhost:3000/api/auth/x/callback`  
   - Self-hosted: `https://YOUR_DOMAIN/api/auth/x/callback`  

4. App permissions: **Read and write** + Direct Messages if offered  
5. Copy Client ID / Secret into `.env.local` (already done if X login works)  
6. On Kami landing: **Log in with X** → see `X connected (@handle)`  
7. Click **Begin** so the account is claimed onto the campaign session  

Re-login after adding `dm.read` / `dm.write` scopes so tokens include DM rights.

---

## B. Instagram — user login (required to send as the user on IG)

**Pay?** Meta app is **free**. Dev mode works for accounts added as testers. Live/Advanced Access needs App Review (process fee: none; time cost: yes).

1. [developers.facebook.com](https://developers.facebook.com) → Create App → add **Instagram**  
2. Choose **Instagram API with Instagram Login**  
3. Convert your tester account to **Business or Creator**  
4. Copy Instagram **App ID** + **App Secret** from Instagram → API setup → Business login settings  
5. Valid OAuth Redirect URI: `http://localhost:3000/api/auth/instagram/callback`  
6. Env:
   ```
   INSTAGRAM_APP_ID=
   INSTAGRAM_APP_SECRET=
   INSTAGRAM_REDIRECT_URI=http://localhost:3000/api/auth/instagram/callback
   ```
7. Landing: **Log in with Instagram** → then **Begin** campaign  

Cold IG DMs may still fail without messaging permissions / prior thread — the API returns an honest error.

---

## C. Apify — find Instagram creators only (not sending)

**Pay?** Free trial credits, then **usage-based** (usually small $ per scrape). Not needed for X-only.

1. [apify.com](https://apify.com) → sign up  
2. Settings → Integrations → API token  
3. Env: `APIFY_API_TOKEN=`  
4. Optional: `APIFY_IG_HASHTAG_ACTOR=apify/instagram-hashtag-scraper`

---

## D. X Ads — optional real boosts

**Pay?** Yes — **ad spend** + Ads API access. Skip until needed; without these the Boost endpoint returns `not_configured` and creates nothing.

Requires an X developer app **approved for Ads API access**, and OAuth 1.0a user tokens (regenerated after approval) for an X user who can manage the ads account. The connected X account must be a promotable user of that ads account, and the account needs an active funding instrument.

```
X_ADS_CONSUMER_KEY=          # app API key
X_ADS_CONSUMER_SECRET=       # app API key secret
X_ADS_ACCESS_TOKEN=          # user access token (OAuth 1.0a)
X_ADS_ACCESS_TOKEN_SECRET=   # user access token secret
X_ADS_ACCOUNT_ID=            # ads account id, e.g. 18ce54d4x5t
X_ADS_FUNDING_INSTRUMENT_ID= # optional; default: first active, fundable instrument
```

A boost creates a paused campaign → engagement line item (automatic bid, founder's budget) → promoted post, then activates the campaign. Each boost is capped at 500 (account currency).

---

## E. Not needed for this marketing pass

- Google Calendar  
- AgentMail (Sales email)  
- RapidAPI (only if you skip Apify)

---

## Checklist before testing DMs

- [ ] Migration `005_connected_accounts_session.sql` applied  
- [ ] X login shows handle; Begin campaign after login  
- [ ] Approve lead/creator in Marketing CRM → DM sends **from that user’s** connected account  
- [ ] Receipt / response includes `account: @handle`  
- [ ] (IG) App ID/Secret + Apify for creator discovery  
- [ ] (Optional) X Ads keys for live boosts  

Status probe: `GET /api/accounts/status` → `{ x_oauth, instagram_oauth, apify, x_ads }`
