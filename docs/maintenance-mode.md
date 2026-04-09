# TourValve Maintenance Page

TourValve now has two maintenance-page options:

- App route: `/maintenance`
- Static fallback file: `frontend/public/maintenance.html`

Use the app route when the frontend service is healthy and you just want to redirect users to a maintenance notice.

Use the static HTML file when you expect the frontend service itself to be restarted or stopped.

## Recommended static fallback approach

Copy the prepared HTML file to the VPS:

```bash
cp /var/www/tourvalve-portal/frontend/public/maintenance.html /var/www/tourvalve-maintenance.html
```

Then point nginx to that file during the maintenance window. One simple pattern is to temporarily change the site root or add a maintenance `location` / `try_files` rule that serves `/var/www/tourvalve-maintenance.html`.

## After maintenance

Revert the nginx change and reload:

```bash
systemctl reload nginx
systemctl restart tourvalve-frontend
systemctl restart tourvalve-backend
```

## Smoke test after recovery

```bash
systemctl status nginx --no-pager
systemctl status tourvalve-frontend --no-pager
systemctl status tourvalve-backend --no-pager
```

Then verify:

- login
- flight search
- bookings
- ancillaries
