"""The app list for the Ephemeral UI kit: name, simple-icons slug, category.

Brand colours and marks come from simple-icons (CC0 data; the marks are the brands' trademarks).
Apps simple-icons does not carry get no colour: the site draws a neutral monogram rather than a
guessed hex. Run `node tools/build-apps.mjs` to resolve this list into src/data/apps.json.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

# category id -> (label, archetypes used by default, in order)
CATEGORIES = {
    "code": ("Code & review", ["merge", "ci", "triage"]),
    "deploy": ("Deploy & infra", ["deploy", "incident", "metric"]),
    "data": ("Databases & data", ["migrate", "metric", "search"]),
    "design": ("Design", ["frames", "approve", "file"]),
    "email": ("Email", ["inbox", "thread", "approve"]),
    "chat": ("Chat & community", ["chat", "notify", "approve"]),
    "meet": ("Meetings & calendar", ["slots", "notify", "chat"]),
    "work": ("Projects & tasks", ["kanban", "triage", "notify"]),
    "docs": ("Docs & knowledge", ["file", "graph", "search"]),
    "files": ("Files & storage", ["file", "search", "approve"]),
    "pay": ("Payments", ["receipt", "metric", "approve"]),
    "shop": ("Commerce", ["track", "receipt", "metric"]),
    "crm": ("Sales & support", ["crm", "chat", "triage"]),
    "money": ("Finance", ["metric", "receipt", "approve"]),
    "ride": ("Rides & delivery", ["ride", "route", "track"]),
    "travel": ("Travel & stays", ["boarding", "slots", "route"]),
    "maps": ("Maps & places", ["route", "search", "notify"]),
    "media": ("Music & video", ["player", "feed", "metric"]),
    "social": ("Social", ["feed", "notify", "metric"]),
    "ai": ("AI & models", ["context", "chat", "metric"]),
    "health": ("Fitness & health", ["workout", "metric", "notify"]),
    "home": ("Home & devices", ["home", "notify", "approve"]),
    "security": ("Identity & security", ["approve", "notify", "incident"]),
    "analytics": ("Analytics & growth", ["metric", "search", "notify"]),
    "agents": ("Agent hosts", ["context", "ci", "approve"]),
}

# (name, simple-icons slug or None, category[, archetype overrides])
APPS = [
    # code
    ("GitHub", "github", "code"), ("GitLab", "gitlab", "code"), ("Bitbucket", "bitbucket", "code"),
    ("Gitea", "gitea", "code"), ("Codeberg", "codeberg", "code"), ("Graphite", None, "code"),
    ("CodeRabbit", "coderabbit", "code"), ("SonarQube", "sonarqubeserver", "code"), ("Snyk", "snyk", "security"),
    ("npm", "npm", "code", ["deploy", "search", "metric"]), ("PyPI", "pypi", "code", ["deploy", "search", "metric"]),
    ("crates.io", "rust", "code", ["deploy", "search", "metric"]), ("Docker Hub", "docker", "deploy"),
    ("CircleCI", "circleci", "code", ["ci", "deploy", "incident"]), ("GitHub Actions", "githubactions", "code", ["ci", "deploy", "notify"]),
    ("Buildkite", "buildkite", "code", ["ci", "deploy", "metric"]), ("Jenkins", "jenkins", "code", ["ci", "deploy", "incident"]),
    ("Replit", "replit", "code", ["deploy", "chat", "file"]), ("CodeSandbox", "codesandbox", "code", ["deploy", "file", "chat"]),
    ("Stack Overflow", "stackoverflow", "code", ["search", "feed", "notify"]), ("Postman", "postman", "code", ["ci", "search", "metric"]),
    # deploy & infra
    ("Vercel", "vercel", "deploy"), ("Netlify", "netlify", "deploy"), ("Cloudflare", "cloudflare", "deploy"),
    ("Fly.io", "flydotio", "deploy"), ("Render", "render", "deploy"), ("Railway", "railway", "deploy"),
    ("Heroku", None, "deploy"), ("DigitalOcean", "digitalocean", "deploy"), ("Google Cloud", "googlecloud", "deploy"),
    ("Kubernetes", "kubernetes", "deploy"), ("Terraform", "terraform", "deploy"), ("Ansible", "ansible", "deploy"),
    ("Sentry", "sentry", "deploy", ["incident", "triage", "metric"]), ("Datadog", "datadog", "deploy", ["metric", "incident", "search"]),
    ("Grafana", "grafana", "deploy", ["metric", "incident", "notify"]), ("PagerDuty", "pagerduty", "deploy", ["incident", "approve", "notify"]),
    ("New Relic", "newrelic", "deploy", ["metric", "incident", "search"]), ("Prometheus", "prometheus", "deploy", ["metric", "incident", "search"]),
    ("Tailscale", "tailscale", "security", ["home", "approve", "notify"]), ("Hetzner", "hetzner", "deploy"),
    # data
    ("Supabase", "supabase", "data"), ("PlanetScale", "planetscale", "data"), ("Neon", None, "data"),
    ("PostgreSQL", "postgresql", "data"), ("MySQL", "mysql", "data"), ("SQLite", "sqlite", "data"),
    ("MongoDB", "mongodb", "data"), ("Redis", "redis", "data"), ("Firebase", "firebase", "data"),
    ("Snowflake", "snowflake", "data"), ("BigQuery", "googlebigquery", "data"), ("Databricks", "databricks", "data"),
    ("ClickHouse", "clickhouse", "data"), ("DuckDB", "duckdb", "data"), ("Elastic", "elastic", "data", ["search", "metric", "incident"]),
    ("Prisma", "prisma", "data"), ("Airbyte", "airbyte", "data"), ("dbt", None, "data"),
    # design
    ("Figma", "figma", "design"), ("Framer", "framer", "design"), ("Sketch", "sketch", "design"),
    ("Canva", None, "design"), ("Dribbble", "dribbble", "design", ["feed", "frames", "notify"]),
    ("Behance", "behance", "design", ["feed", "frames", "notify"]), ("Spline", None, "design"),
    ("Blender", "blender", "design", ["deploy", "frames", "file"]), ("Storybook", "storybook", "design", ["frames", "ci", "search"]),
    ("Webflow", "webflow", "design", ["deploy", "frames", "metric"]), ("Miro", "miro", "design", ["graph", "frames", "chat"]),
    # email
    ("Gmail", "gmail", "email"), ("Outlook", None, "email"), ("Proton Mail", "protonmail", "email"),
    ("Fastmail", None, "email"), ("Superhuman", None, "email"), ("HEY", None, "email"),
    ("Mailchimp", "mailchimp", "email", ["metric", "approve", "inbox"]), ("Resend", "resend", "email", ["deploy", "metric", "inbox"]),
    # chat
    ("Slack", None, "chat"), ("Discord", "discord", "chat"), ("Telegram", "telegram", "chat"),
    ("WhatsApp", "whatsapp", "chat"), ("Signal", "signal", "chat"), ("Messenger", "messenger", "chat"),
    ("Microsoft Teams", None, "chat"), ("Matrix", "matrix", "chat"), ("iMessage", None, "chat"),
    ("WeChat", "wechat", "chat"), ("LINE", "line", "chat"), ("Zulip", "zulip", "chat"),
    # meet & calendar
    ("Google Calendar", "googlecalendar", "meet"), ("Zoom", "zoom", "meet"), ("Google Meet", "googlemeet", "meet"),
    ("Calendly", "calendly", "meet"), ("Cal.com", "caldotcom", "meet"), ("Cron", None, "meet"),
    ("Loom", "loom", "meet", ["player", "chat", "notify"]), ("Fireflies", None, "meet", ["file", "chat", "search"]),
    # work
    ("Linear", "linear", "work"), ("Jira", "jira", "work"), ("Asana", "asana", "work"),
    ("Trello", "trello", "work"), ("Todoist", "todoist", "work"), ("ClickUp", "clickup", "work"),
    ("Monday.com", None, "work"), ("Basecamp", "basecamp", "work"), ("Height", None, "work"),
    ("Things", "things", "work"), ("TickTick", "ticktick", "work"), ("Shortcut", "shortcut", "work"),
    ("Plane", None, "work"), ("YouTrack", None, "work"),
    # docs
    ("Notion", "notion", "docs"), ("Confluence", "confluence", "docs"), ("Obsidian", "obsidian", "docs"),
    ("Google Docs", "googledocs", "docs"), ("Coda", "coda", "docs"), ("Craft", None, "docs"),
    ("Logseq", "logseq", "docs"), ("Roam Research", "roamresearch", "docs"), ("Readwise", None, "docs"),
    ("Evernote", "evernote", "docs"), ("Bear", None, "docs"), ("GitBook", "gitbook", "docs"),
    ("Google Sheets", "googlesheets", "docs", ["metric", "migrate", "file"]), ("Airtable", "airtable", "docs", ["migrate", "kanban", "search"]),
    ("DocuSign", None, "docs", ["sign", "approve", "notify"]), ("Dropbox Sign", None, "docs", ["sign", "approve", "notify"]),
    # files
    ("Google Drive", "googledrive", "files"), ("Dropbox", "dropbox", "files"), ("Box", "box", "files"),
    ("iCloud", "icloud", "files"), ("OneDrive", None, "files"), ("Mega", "mega", "files"),
    ("Backblaze", "backblaze", "files"), ("Proton Drive", "protondrive", "files"),
    # pay
    ("Stripe", "stripe", "pay"), ("PayPal", "paypal", "pay"), ("Square", "square", "pay"),
    ("Apple Pay", "applepay", "pay"), ("Google Pay", "googlepay", "pay"), ("Venmo", "venmo", "pay"),
    ("Cash App", "cashapp", "pay"), ("Wise", "wise", "pay"), ("Klarna", "klarna", "pay"),
    ("Revolut", "revolut", "money"), ("Paddle", "paddle", "pay"), ("Lemon Squeezy", "lemonsqueezy", "pay"),
    # shop
    ("Shopify", "shopify", "shop"), ("Amazon", None, "shop"), ("eBay", "ebay", "shop"),
    ("Etsy", "etsy", "shop"), ("Walmart", None, "shop"), ("Target", "target", "shop"),
    ("Gumroad", "gumroad", "shop"), ("WooCommerce", "woocommerce", "shop"), ("IKEA", "ikea", "shop"),
    ("Best Buy", None, "shop"), ("Costco", None, "shop"), ("FedEx", "fedex", "shop", ["track", "route", "notify"]),
    ("UPS", "ups", "shop", ["track", "route", "notify"]), ("DHL", "dhl", "shop", ["track", "route", "notify"]),
    # crm & support
    ("Salesforce", None, "crm"), ("HubSpot", "hubspot", "crm"), ("Pipedrive", None, "crm"),
    ("Zendesk", "zendesk", "crm"), ("Intercom", "intercom", "crm"), ("Front", None, "crm"),
    ("Attio", None, "crm"), ("Freshdesk", None, "crm"), ("Help Scout", "helpscout", "crm"),
    ("Gong", None, "crm"), ("Apollo", None, "crm"),
    # money
    ("QuickBooks", "quickbooks", "money"), ("Xero", "xero", "money"), ("Mercury", None, "money"),
    ("Brex", "brex", "money"), ("Ramp", None, "money"), ("Plaid", None, "money"),
    ("Robinhood", "robinhood", "money"), ("Coinbase", "coinbase", "money"), ("Monzo", "monzo", "money"),
    ("Chase", "chase", "money"), ("American Express", "americanexpress", "money"), ("Gusto", None, "money"),
    ("Splitwise", None, "money"), ("YNAB", None, "money"),
    # ride & delivery
    ("Uber", "uber", "ride"), ("Lyft", "lyft", "ride"), ("Uber Eats", "ubereats", "ride", ["track", "receipt", "route"]),
    ("DoorDash", "doordash", "ride", ["track", "receipt", "route"]), ("Instacart", "instacart", "ride", ["track", "receipt", "approve"]),
    ("Grubhub", None, "ride", ["track", "receipt", "route"]), ("Deliveroo", "deliveroo", "ride", ["track", "receipt", "route"]),
    ("Bolt", None, "ride"), ("Grab", None, "ride"), ("Lime", None, "ride"), ("Waymo", None, "ride"),
    # travel
    ("Airbnb", "airbnb", "travel", ["slots", "route", "receipt"]), ("Booking.com", "bookingdotcom", "travel", ["slots", "route", "receipt"]),
    ("Expedia", "expedia", "travel"), ("United", "unitedairlines", "travel"), ("Delta", "delta", "travel"),
    ("American Airlines", "americanairlines", "travel"), ("Southwest", None, "travel"), ("Lufthansa", "lufthansa", "travel"),
    ("Tripadvisor", "tripadvisor", "travel", ["search", "route", "feed"]), ("Hopper", None, "travel"),
    ("Amtrak", None, "travel"), ("Flighty", None, "travel", ["boarding", "notify", "route"]),
    # maps
    ("Google Maps", "googlemaps", "maps"), ("Apple Maps", None, "maps"), ("Waze", "waze", "maps"),
    ("OpenStreetMap", "openstreetmap", "maps"), ("Yelp", "yelp", "maps", ["search", "route", "feed"]),
    ("Foursquare", "foursquare", "maps"), ("Citymapper", None, "maps"), ("Transit", None, "maps"),
    # media
    ("Spotify", "spotify", "media"), ("YouTube", "youtube", "media"), ("Apple Music", "applemusic", "media"),
    ("Netflix", "netflix", "media"), ("Twitch", "twitch", "media"), ("SoundCloud", "soundcloud", "media"),
    ("Tidal", "tidal", "media"), ("Pocket Casts", "pocketcasts", "media"), ("Plex", "plex", "media"),
    ("Letterboxd", "letterboxd", "media", ["feed", "search", "metric"]), ("Vimeo", "vimeo", "media"),
    ("Audible", "audible", "media"), ("Shazam", "shazam", "media", ["player", "search", "notify"]),
    # social
    ("X", "x", "social"), ("Reddit", "reddit", "social"), ("LinkedIn", None, "social"),
    ("Instagram", "instagram", "social"), ("Bluesky", "bluesky", "social"), ("Mastodon", "mastodon", "social"),
    ("Threads", "threads", "social"), ("TikTok", "tiktok", "social"), ("Pinterest", "pinterest", "social"),
    ("Hacker News", "ycombinator", "social"), ("Product Hunt", "producthunt", "social"), ("Substack", "substack", "social"),
    ("Medium", "medium", "social"), ("Farcaster", "farcaster", "social"), ("Snapchat", "snapchat", "social"),
    # ai
    ("Claude", "claude", "ai"), ("ChatGPT", None, "ai"), ("Gemini", "googlegemini", "ai"),
    ("Hugging Face", "huggingface", "ai"), ("Perplexity", "perplexity", "ai"), ("Mistral", "mistralai", "ai"),
    ("Ollama", "ollama", "ai"), ("Replicate", "replicate", "ai"), ("ElevenLabs", "elevenlabs", "ai", ["player", "context", "metric"]),
    ("Midjourney", None, "ai", ["frames", "context", "feed"]), ("Weights & Biases", "weightsandbiases", "ai", ["metric", "ci", "context"]),
    ("LangChain", "langchain", "ai"), ("OpenRouter", "openrouter", "ai"), ("Groq", None, "ai"),
    # health
    ("Strava", "strava", "health"), ("Fitbit", "fitbit", "health"), ("Garmin", "garmin", "health"),
    ("Apple Health", None, "health"), ("Oura", None, "health"), ("WHOOP", None, "health"),
    ("Peloton", "peloton", "health"), ("MyFitnessPal", None, "health"), ("Headspace", "headspace", "health"),
    ("Duolingo", "duolingo", "health", ["workout", "notify", "metric"]),
    # home
    ("Home Assistant", "homeassistant", "home"), ("Philips Hue", "philipshue", "home"), ("Nest", None, "home"),
    ("SmartThings", "smartthings", "home"), ("Ring", "ring", "home"), ("Sonos", "sonos", "home", ["player", "home", "notify"]),
    ("Tesla", "tesla", "home", ["home", "route", "metric"]), ("Ecobee", None, "home"), ("Roborock", None, "home"),
    # security
    ("1Password", "1password", "security"), ("Bitwarden", "bitwarden", "security"), ("Okta", "okta", "security"),
    ("Auth0", "auth0", "security"), ("Clerk", "clerk", "security"), ("Cloudflare Zero Trust", "cloudflare", "security"),
    ("Let's Encrypt", "letsencrypt", "security"), ("YubiKey", "yubico", "security"),
    # analytics
    ("PostHog", "posthog", "analytics"), ("Mixpanel", "mixpanel", "analytics"), ("Amplitude", None, "analytics"),
    ("Google Analytics", "googleanalytics", "analytics"), ("Plausible", "plausibleanalytics", "analytics"),
    ("Segment", None, "analytics"), ("Hotjar", "hotjar", "analytics"), ("Search Console", "googlesearchconsole", "analytics"),
    ("Ahrefs", None, "analytics"), ("Metabase", "metabase", "analytics"),
    # agent hosts (the cards render inside these)
    ("Hermes Agent", None, "agents"), ("T3 Code", None, "agents"), ("Claude Code", "claude", "agents"),
    ("Codex", None, "agents"), ("Cursor", "cursor", "agents"), ("Zed", "zedindustries", "agents"),
    ("OpenCode", None, "agents"), ("Raycast", "raycast", "agents"), ("Warp", "warp", "agents"),
    ("Composio", None, "agents"), ("Zapier", "zapier", "agents", ["ci", "graph", "notify"]),
    ("n8n", "n8n", "agents", ["graph", "ci", "notify"]), ("Make", "make", "agents", ["graph", "ci", "notify"]),
]


def main():
    from catalog_studio import STUDIO_APPS, STUDIO_CATEGORIES
    cats = {**CATEGORIES, **STUDIO_CATEGORIES}
    seen = {}
    rows = []
    for row in APPS:
        name, slug, cat = row[:3]
        assert cat in cats, (name, cat)
        assert name not in seen, name
        kinds = row[3] if len(row) > 3 else cats[cat][1]
        seen[name] = {"name": name, "slug": slug, "cat": cat, "kinds": list(kinds)}
        rows.append(seen[name])
    # Studio rows: new apps, or richer kinds/metadata for an app the base list already has.
    for name, slug, cat, kinds, extra in STUDIO_APPS:
        assert cat in cats, (name, cat)
        if name in seen:
            r = seen[name]
            r["kinds"] = list(kinds)  # studio rows know the app better than the base archetypes
            r.update({k: v for k, v in extra.items()})
            continue
        seen[name] = {"name": name, "slug": slug, "cat": cat, "kinds": list(kinds), **extra}
        rows.append(seen[name])
    out = {"categories": [{"id": k, "label": v[0], "studio": k in STUDIO_CATEGORIES} for k, v in cats.items()], "apps": rows}
    json.dump(out, sys.stdout, indent=1)


if __name__ == "__main__":
    main()
