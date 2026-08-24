# Flowday iOS release setup

The iOS app is a bundled Capacitor client. It does not load the production website as its app shell. The bundle ID is `com.senganglemon.flowday`, the App Store version is `1.0`, and GitHub Actions supplies a unique build number.

## GitHub repository configuration

Add these repository variables under **Settings → Secrets and variables → Actions → Variables**:

- `APPLE_TEAM_ID`
- `APPSTORE_ISSUER_ID`
- `APPSTORE_API_KEY_ID`

Add these repository secrets under **Settings → Secrets and variables → Actions → Secrets**:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `APPSTORE_API_PRIVATE_KEY` — the complete contents of the downloaded `AuthKey_*.p8`
- `APPSTORE_CERTIFICATES_FILE_BASE64` — the Apple Distribution `.p12` encoded as one Base64 string
- `APPSTORE_CERTIFICATES_PASSWORD` — the password used when the `.p12` was created

Never commit the `.p8`, `.p12`, provisioning profile, passwords, or service-role key.

## Apple signing assets

Create an Apple Distribution certificate and an App Store Connect provisioning profile for `com.senganglemon.flowday`. Name the profile exactly:

`AppStore com.senganglemon.flowday`

The GitHub workflow downloads that profile through the App Store Connect API, imports the distribution certificate into a temporary keychain, builds with Xcode 26, exports an IPA, and uploads it to TestFlight.

## Run the workflow

Open **GitHub → Actions → iOS build and TestFlight → Run workflow**.

- Leave `upload_testflight` off for an unsigned simulator build.
- Turn it on only after all variables, secrets, the certificate, and the provisioning profile are ready.
