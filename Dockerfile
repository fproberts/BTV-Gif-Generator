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

# Start command: Use 'cp -rn' to copy backup data to volumes WITHOUT overwriting existing files
CMD ["sh", "-c", "echo 'Checking for data migration...' && cp -rn /migration/data/* /app/data/ || true && cp -rn /migration/uploads/* /app/public/uploads/ || true && npm start"]
