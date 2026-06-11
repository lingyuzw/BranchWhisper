# Engagement Module

## Responsibility

Handles proactive messages, reminders, and follow-up policy.

## Current Path

```text
backend/engagement/
```

## Runtime Files

- `runtime/proactive_config.json`
- `runtime/proactive.sqlite3`
- `runtime/reminders.sqlite3`

## Modification Notes

This module can trigger messages through web or integrations. Keep delivery channels explicit and avoid hidden background side effects.
