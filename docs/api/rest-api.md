# REST API

## Stable Route Groups

- `/api/config`
- `/api/profiles`
- `/api/assets`
- `/api/engagement`
- `/api/memory`
- `/api/tools`
- `/api/conversations`
- `/api/integrations`
- `/api/services`

## Rule

Routers should remain thin. They should validate request payloads, call stores or managers, and return response models. Business behavior belongs in backend modules or managers, not inside frontend code.

## Compatibility

Do not rename existing response fields without a frontend migration.
