#!/bin/bash

# Colors for better output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting Live Chat System in development mode...${NC}"

# Navigate to the project directory
cd LiveChatSystem

# Update packages
echo -e "${BLUE}Installing dependencies...${NC}"
npm install

if [ $? -ne 0 ]; then
  echo -e "${RED}Failed to install Node.js dependencies. Please check the logs above for errors.${NC}"
  exit 1
fi

echo -e "${GREEN}Dependencies installed successfully!${NC}"

# Start the application in development mode
echo -e "${BLUE}Starting the application in development mode...${NC}"
npm run dev