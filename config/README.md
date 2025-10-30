# Config Placeholders

Store deployment credentials and environment-specific configuration here. Example files:

- `service-account.json` — GCP service account for Firestore + Pub/Sub
- `firestore.rules` — security rules for the recruiting dataset
- `redis.conf` — optional Redis overrides

Never commit real secrets. Use `.env` or a secret manager in production.
