# U18 ScrimBot: team membership and dropdown challenge flow

## What changes
- **My Team** appears on the persistent Scrim Center message; this displays the signed-in user's registered team based on their Discord ID.
- Existing registered **captains are backfilled** into the membership table automatically on startup.
- A captain can use **Invite Player** to select a server member from the native Discord user dropdown. The invited member must accept with **Join Team**; this prevents forced joins.
- Players can leave via **My Team → Leave Team**. Captains must first transfer captaincy to an existing joined teammate with **Transfer Captain**, then leave.
- A user may belong to **one team per Discord server**. Switching teams requires leaving first.
- The **Challenge Team** wizard automatically uses the registered team of the captain, without typing it.
- The opponent selector contains **registered teams only**, 25 per page with navigation; your own team is excluded.
- Date selector shows **today plus six days** according to America/Los_Angeles timezone; match time choices are 10:00–21:30 PT at 30-minute intervals.
- Format selector supports BO3/BO5. All controls are button/select interactions. There are no free-text fields in the guided challenge flow.
- The existing scrim reporting and confirmation steps are unchanged.

## Deployment
Merge the PR into `main`; Railway should redeploy the same background service. Keep the existing `DATABASE_PATH=/data/u18scrim.sqlite` and volume. New tables are added automatically without clearing old team or match data. Do not create a second Railway service.

## Test procedure
1. In a private Discord staging channel, run `/scrimcenter` (server manager) to refresh the panel.
2. Select **My Team** as a team captain; verify the captain's membership is displayed.
3. Choose **Invite Player** and select a test Discord member. Confirm they must click **Join Team** before showing as a member.
4. As the member, choose **My Team**, then **Leave Team**. Verify they can leave and rejoin by invitation.
5. Test captaincy transfer to a joined teammate. Captains cannot leave without transferring.
6. As captain, choose **Challenge Team**, select opponent, date, start time and BO3/BO5 from dropdowns.
7. Send challenge, then accept using the *opposing captain's* Discord account.
8. Report screenshot and confirm result as before; verify leaderboard.

## Limitations
- **No graphical calendar popup yet:** the native Discord interface uses a next-seven-day dropdown; the later web dashboard will offer a month/week calendar.
- **One team per user** is enforced per guild. Existing legacy captains with multiple teams may need admin cleanup.
- Challenge dates/times are currently requested/announced; automated scheduled start and reminders are not built.
- No external verification against U18 league roster registration yet. Run on a private/staging server with verified captains until identity integration is ready.
- The captain invite announcement uses `CHALLENGES_CHANNEL_ID` if configured, or the channel where the invite was initiated. Use a private staff/captain channel if the invitation shouldn't be publicly visible.
- Date/time dropdowns may offer an already elapsed slot for today; the backend rejects that at submission.
