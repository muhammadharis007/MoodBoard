# Use the official lightweight Node image
FROM node:18-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package files first (for caching)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the app
COPY . .

# Tell Docker the app uses port 3000
EXPOSE 3000

# Command to run the app
CMD ["node", "server.js"]