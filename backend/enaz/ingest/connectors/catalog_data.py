"""The connector catalog the platform targets, with the real BrandLogo ids.

Entries whose `type` has a registered class (web, github) fetch live content.
The rest are advertised integrations with their config shape; wiring each one is
the same pattern as `builtin.py` — implement `fetch()` and register it.
"""

from __future__ import annotations

from . import builtin, feeds, universal  # noqa: F401 - registers live connectors
from .base import catalog as live_catalog

CATALOG: list[dict] = [
    {"logo": "slack", "name": "Slack", "type": "slack", "category": "Messaging", "sync": "Webhook", "acl": True},
    {"logo": "teams", "name": "Microsoft Teams", "type": "teams", "category": "Messaging", "sync": "Webhook", "acl": True},
    {"logo": "gmail", "name": "Gmail", "type": "gmail", "category": "Messaging", "sync": "Webhook", "acl": True},
    {"logo": "outlook", "name": "Outlook", "type": "outlook", "category": "Messaging", "sync": "Webhook", "acl": True},
    {"logo": "discord", "name": "Discord", "type": "discord", "category": "Messaging", "sync": "Webhook", "acl": True},
    {"logo": "zoom", "name": "Zoom", "type": "zoom", "category": "Messaging", "sync": "Poll", "acl": True},
    {"logo": "intercom", "name": "Intercom", "type": "intercom", "category": "Messaging", "sync": "Webhook", "acl": False},
    {"logo": "email", "name": "Email (IMAP)", "type": "imap", "category": "Messaging", "sync": "Poll", "acl": False},
    {"logo": "googledrive", "name": "Google Drive", "type": "gdrive", "category": "Storage", "sync": "Webhook", "acl": True},
    {"logo": "onedrive", "name": "OneDrive", "type": "onedrive", "category": "Storage", "sync": "Webhook", "acl": True},
    {"logo": "dropbox", "name": "Dropbox", "type": "dropbox", "category": "Storage", "sync": "Webhook", "acl": True},
    {"logo": "box", "name": "Box", "type": "box", "category": "Storage", "sync": "Webhook", "acl": True},
    {"logo": "s3", "name": "Amazon S3", "type": "s3", "category": "Storage", "sync": "Poll", "acl": False},
    {"logo": "sharepoint", "name": "SharePoint", "type": "sharepoint", "category": "Wiki & Docs", "sync": "Webhook", "acl": True},
    {"logo": "confluence", "name": "Confluence", "type": "confluence", "category": "Wiki & Docs", "sync": "Webhook", "acl": True},
    {"logo": "notion", "name": "Notion", "type": "notion", "category": "Wiki & Docs", "sync": "Poll", "acl": True},
    {"logo": "coda", "name": "Coda", "type": "coda", "category": "Wiki & Docs", "sync": "Poll", "acl": True},
    {"logo": "gitbook", "name": "GitBook", "type": "gitbook", "category": "Wiki & Docs", "sync": "Poll", "acl": False},
    {"logo": "outline", "name": "Outline", "type": "outline", "category": "Wiki & Docs", "sync": "Webhook", "acl": True},
    {"logo": "guru", "name": "Guru", "type": "guru", "category": "Wiki & Docs", "sync": "Poll", "acl": True},
    {"logo": "googlecalendar", "name": "Google Calendar", "type": "gcal", "category": "Wiki & Docs", "sync": "Webhook", "acl": True},
    {"logo": "jira", "name": "Jira", "type": "jira", "category": "Tickets & Projects", "sync": "Webhook", "acl": True},
    {"logo": "linear", "name": "Linear", "type": "linear", "category": "Tickets & Projects", "sync": "Webhook", "acl": True},
    {"logo": "asana", "name": "Asana", "type": "asana", "category": "Tickets & Projects", "sync": "Webhook", "acl": True},
    {"logo": "clickup", "name": "ClickUp", "type": "clickup", "category": "Tickets & Projects", "sync": "Webhook", "acl": True},
    {"logo": "trello", "name": "Trello", "type": "trello", "category": "Tickets & Projects", "sync": "Webhook", "acl": True},
    {"logo": "airtable", "name": "Airtable", "type": "airtable", "category": "Tickets & Projects", "sync": "Poll", "acl": True},
    {"logo": "zendesk", "name": "Zendesk", "type": "zendesk", "category": "Tickets & Projects", "sync": "Webhook", "acl": True},
    {"logo": "freshdesk", "name": "Freshdesk", "type": "freshdesk", "category": "Tickets & Projects", "sync": "Poll", "acl": True},
    {"logo": "servicenow", "name": "ServiceNow", "type": "servicenow", "category": "Tickets & Projects", "sync": "Poll", "acl": True},
    {"logo": "figma", "name": "Figma", "type": "figma", "category": "Tickets & Projects", "sync": "Poll", "acl": True},
    {"logo": "github", "name": "GitHub", "type": "github", "category": "Code", "sync": "Webhook", "acl": True},
    {"logo": "gitlab", "name": "GitLab", "type": "gitlab", "category": "Code", "sync": "Webhook", "acl": True},
    {"logo": "bitbucket", "name": "Bitbucket", "type": "bitbucket", "category": "Code", "sync": "Webhook", "acl": True},
    {"logo": "salesforce", "name": "Salesforce", "type": "salesforce", "category": "Sales & CRM", "sync": "Webhook", "acl": True},
    {"logo": "hubspot", "name": "HubSpot", "type": "hubspot", "category": "Sales & CRM", "sync": "Webhook", "acl": True},
    {"logo": "gong", "name": "Gong", "type": "gong", "category": "Sales & CRM", "sync": "Poll", "acl": True},
    {"logo": "web", "name": "Website crawler", "type": "web", "category": "Other", "sync": "Poll", "acl": False},
    {"logo": "web", "name": "RSS / Atom feed", "type": "rss", "category": "Other", "sync": "Poll", "acl": False},
    {"logo": "web", "name": "Sitemap", "type": "sitemap", "category": "Other", "sync": "Poll", "acl": False},
    {"logo": "file", "name": "File upload", "type": "upload", "category": "Other", "sync": "Upload", "acl": True},
    {"logo": "postgres", "name": "SQL database", "type": "sql", "category": "Other", "sync": "Federated", "acl": True},
    {"logo": "custom", "name": "REST / JSON API", "type": "rest", "category": "Other", "sync": "Poll", "acl": False},
    {"logo": "custom", "name": "Any MCP server", "type": "mcp", "category": "Other", "sync": "Federated", "acl": True},
]


def full_catalog() -> list[dict]:
    live = {m.type for m in live_catalog()} | {"upload"}
    return [{**entry, "live": entry["type"] in live} for entry in CATALOG]
