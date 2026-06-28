#!/usr/bin/env sh
set -e

echo "==> Applying database migrations (alembic upgrade head)"
alembic upgrade head

echo "==> Ensuring superadmin exists"
python -m scripts.create_superadmin

echo "==> Starting: $*"
exec "$@"
