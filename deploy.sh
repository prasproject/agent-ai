#!/bin/bash

# Colors for better output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting deployment of Live Chat System...${NC}"

# Check if the repository has already been cloned
if [ -d "LiveChatSystem" ]; then
    echo -e "${BLUE}Repository already exists, updating...${NC}"
    cd LiveChatSystem
    git pull
    cd ..
else
    echo -e "${BLUE}Cloning repository from GitHub...${NC}"
    git clone https://github.com/prasproject/LiveChatSystem.git
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to clone repository. Please check the URL and try again.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Repository cloned successfully!${NC}"
fi

# Navigate to the project directory
cd LiveChatSystem

# Detect the type of project (Node.js, Python, etc.)
if [ -f "package.json" ]; then
    echo -e "${BLUE}Node.js project detected. Installing dependencies...${NC}"
    npm install
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to install Node.js dependencies. Please check the logs above for errors.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Node.js dependencies installed successfully!${NC}"
    
    # Check if there are any environment variables to set
    if [ -f ".env.example" ]; then
        echo -e "${BLUE}Creating .env file from example...${NC}"
        cp .env.example .env
        echo -e "${GREEN}Created .env file. You may need to configure it with your specific settings.${NC}"
    fi
    
    # Run build first, then start the application
    echo -e "${BLUE}Building the application...${NC}"
    npm run build
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to build application. Please check the logs above for errors.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Build successful!${NC}"
    
    # Start the application based on package.json scripts
    if grep -q "\"start\":" package.json; then
        echo -e "${BLUE}Starting the application...${NC}"
        npm start
    else
        echo -e "${BLUE}No start script found in package.json. Trying to start with node index.js...${NC}"
        if [ -f "index.js" ]; then
            node index.js
        elif [ -f "app.js" ]; then
            node app.js
        elif [ -f "server.js" ]; then
            node server.js
        else
            echo -e "${RED}Could not determine the entry point. Please start the application manually.${NC}"
            exit 1
        fi
    fi
    
elif [ -f "requirements.txt" ]; then
    echo -e "${BLUE}Python project detected. Installing dependencies...${NC}"
    pip install -r requirements.txt
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to install Python dependencies. Please check the logs above for errors.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Python dependencies installed successfully!${NC}"
    
    # Check for environment variables
    if [ -f ".env.example" ]; then
        echo -e "${BLUE}Creating .env file from example...${NC}"
        cp .env.example .env
        echo -e "${GREEN}Created .env file. You may need to configure it with your specific settings.${NC}"
    fi
    
    # Start the application
    if [ -f "app.py" ]; then
        echo -e "${BLUE}Starting the application...${NC}"
        python app.py
    elif [ -f "main.py" ]; then
        echo -e "${BLUE}Starting the application...${NC}"
        python main.py
    else
        echo -e "${RED}Could not determine the entry point. Please start the application manually.${NC}"
        exit 1
    fi
    
else
    echo -e "${RED}Could not determine the project type. Please check the repository and install dependencies manually.${NC}"
    exit 1
fi

echo -e "${GREEN}Deployment completed! The Live Chat System should now be running.${NC}"
