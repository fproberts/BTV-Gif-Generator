FROM node:18-alpine

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

# Build Next.js app
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start"]
