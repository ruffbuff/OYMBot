#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════╗"
echo "║   🤖 AI Agent Platform - Launcher    ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Running onboard first...${NC}\n"
    npm run onboard
    echo ""
fi

# Check if gateway is already running
if lsof -Pi :4001 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${GREEN}✅ Gateway is already running${NC}\n"
else
    echo -e "${BLUE}🚀 Starting gateway in background...${NC}"
    npm run gateway > gateway.log 2>&1 &
    GATEWAY_PID=$!
    echo -e "${GREEN}✅ Gateway started (PID: $GATEWAY_PID)${NC}"
    echo -e "${BLUE}📝 Logs: backend/gateway.log${NC}\n"
    
    # Wait for gateway to start
    echo -e "${YELLOW}⏳ Waiting for gateway to initialize...${NC}"
    sleep 3
fi

# Start chat
echo -e "${BLUE}💬 Starting chat interface...${NC}\n"
npm run chat

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down...${NC}"
    if [ ! -z "$GATEWAY_PID" ]; then
        kill $GATEWAY_PID 2>/dev/null
        echo -e "${GREEN}✅ Gateway stopped${NC}"
    fi
    exit 0
}

trap cleanup EXIT INT TERM
