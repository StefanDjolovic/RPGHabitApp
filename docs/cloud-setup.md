# Cloud Account Setup

1. Create a Supabase project.
2. Open the SQL Editor and run `supabase/schema.sql`.
3. Enable email confirmation in Authentication > Providers > Email.
4. Copy the Project URL and publishable key from the Connect dialog.
5. Create `.env.local` from `.env.example` and enter those two public values.
6. Add the same values to the EAS `preview` and `production` environments.

This release includes `expo-secure-store`, so install a new Android build of app version 1.1.0 once. Later JavaScript-only changes can continue to arrive through EAS Update.

Never place a Supabase secret or service-role key in the app or in an `EXPO_PUBLIC_` variable.

## Admin Account

Register a dedicated account in the app and verify its email. Then run this in the Supabase SQL Editor:

```sql
update public.profiles
set role = 'admin', updated_at = now()
where id = (select id from auth.users where email = 'your-admin-email@example.com');
```

Sign out and sign back in. The Account screen will then show **Admin Lab**.

Each installation keeps one local profile. To keep personal and admin progress fully separate, use the admin account on a fresh app installation or a separate test device. The app blocks a new account from accidentally inheriting another account's local progress.

## Backup Behavior

- Existing local progress is uploaded after the first verified sign-in.
- A new phone with no progress automatically restores the latest cloud backup.
- The app backs up when it moves to the background.
- When a newer cloud backup conflicts with local progress, the Account screen asks the user to choose Backup or Restore instead of overwriting either copy silently.
