# Bar Buddy Startup – Database Persistence & Security Enhancements

As part of a pro bono collaboration with a friend’s early‑stage startup, I took ownership of the data‑layer and state‑management modules for Bar Buddy’s user and venue features. My remit included aligning the codebase with the actual Supabase schema, restoring reliable persistence both online and offline, and hardening data‑flow components with improved error handling, logging, and security practices drawn from my cybersecurity and data‑science expertise.

---

## 1. `backend/trpc/routes/user/create-profile/route.ts`

In this server‐side route, responsible for creating or upserting user profiles during sign‑up, I discovered mismatches between the code’s table and column names and the actual Supabase schema. The following adjustments were made:

- **Schema Alignment**: Renamed the target table from `profiles` to `user_profiles` and updated column identifiers (e.g., `profile_pic` in place of `profile_picture`) to match the database.  
- **Timestamps**: Injected `created_at` and `updated_at` fields on insert and update, ensuring every profile record carries accurate creation and modification metadata.  
- **Error Handling & Logging**: Wrapped the Supabase upsert in try/catch blocks, emitted structured logs on failures, and surfaced meaningful error messages to aid debugging and future security audits.

---

## 2. `stores/userProfileStore.ts`

On the frontend, this Zustand store drives profile loading, creation, and friend relationships. Key improvements include:

- **Corrected Queries**: Swapped all references from the obsolete `profiles` table to `user_profiles` and adapted joins for friend requests to use the updated alias.  
- **Timestamp Propagation**: Ensured that timestamps captured in the backend are retained in the client state, facilitating accurate UI displays and offline sync logic.  
- **Offline Persistence**: Continued to leverage AsyncStorage for local caching, but added checks to defer writes until the network is available and to reconcile conflicts based on `updated_at`.  
- **Robust Error Paths**: Introduced granular logging around every Supabase call, surfaced user‑friendly error states in the UI, and added retry hooks to recover seamlessly from transient network failures.

---

## 3. `stores/venueInteractionStore.ts`

This store tracks user check‑ins, likes, and venue popularity metrics. I extended it to bridge local state with Supabase and to support data‑analysis hooks:

- **`syncToSupabase` Method**: Bundles pending interactions and writes them in bulk to the `venue_interactions` table, respecting Supabase rate limits and preserving data integrity.  
- **`loadPopularTimesFromSupabase` Method**: Fetches historical interaction data on app startup to seed UI components that visualize peak hours and trending venues.  
- **UI Reactivity & Logging**: Forced update calls ensure the UI reflects new data immediately; detailed logs capture sync success or failure for later forensic review and anomaly detection.  
- **Offline‑First Model**: Like the user profile store, interactions are cached in AsyncStorage and replayed once connectivity returns, with conflict resolution governed by timestamp‑based rules.

---

## Overall Impact

By reconciling code and database schemas, introducing end‑to‑end timestamp tracking, and embedding richer error handling and logging, these changes restored reliable data persistence and significantly strengthened the application’s security posture. Beyond these fixes, I contributed to threat‑surface analysis of the Supabase client flows and laid the groundwork for future data‑science integrations—such as anomaly detection on user behavior and venue popularity trends.
