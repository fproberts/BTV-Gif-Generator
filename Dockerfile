FROM node:20-alpine

# Install Python 3 and Pillow (Image processing library)
# py3-pillow is the Alpine package for Pillow, pre-compiled (faster/easier than pip)
RUN apk add --no-cache python3 py3-pillow

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm ci

# Copy output (if you want to be safe and avoid carrying over local artifacts, 
# typically we copy everything and let dockerignore filter)
COPY . .

# --- DATA MIGRATION LAYER ---
# Back up the local data (which was copied via COPY . .) to a safe spot.
# This allows us to restore it into the Volume at runtime if the Volume is empty.
RUN mkdir -p /migration/data && mkdir -p /migration/uploads
RUN cp -r /app/data/* /migration/data/ || true
RUN cp -r /app/public/uploads/* /migration/uploads/ || true
# ----------------------------

# Build Next.js app
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Expose port (Railway often uses 8080)
EXPOSE 8080
ENV PORT=8080
ENV STORAGE_PATH=/app/persistent

# Start command:
# Run-Once Logic Enhanced:
# 1. Uploads: Always try to copy MISSING files (cp -rn) - Safe for merging.
# 2. Database: If db.json is MISSING OR EMPTY (created by init), force overwrite with migration data.
# Start command:
# Run-Once Logic Enhanced:
# 1. Uploads: Always try to copy MISSING files (cp -rn) - Safe for merging.
# 2. Database: If db.json is MISSING OR EMPTY (created by init), force overwrite with migration data.
# 3. Permissions: Force everything in persistent storage to be writable (chmod -R 777).
CMD ["sh", "-c", "mkdir -p /app/persistent/data && mkdir -p /app/persistent/uploads && echo 'Migrating...' && cp -rn /migration/uploads/* /app/persistent/uploads/ || true && if [ ! -f /app/persistent/data/db.json ] || [ $(stat -c%s /app/persistent/data/db.json 2>/dev/null || stat -f%z /app/persistent/data/db.json) -lt 100 ]; then echo 'DB missing/empty. Force migrating...' && cp -f /migration/data/db.json /app/persistent/data/db.json; else echo 'Valid DB exists. Skipping core data migration.'; fi && chmod -R 777 /app/persistent && npm start"]
