#!/bin/bash

# End-to-End Test: 4-message flow
# Tests complete conversation: search → add to cart → policy question → checkout

SESSION_ID=$(uuidgen)
BASE_URL="http://localhost:3000"

echo ""
echo "================================================================================"
echo "🧪 END-TO-END TEST: 4-MESSAGE FLOW"
echo "Session ID: $SESSION_ID"
echo "================================================================================"
echo ""

# Message 1: Search
echo "📨 Message 1: \"hola, busco una mochila\""
echo "--------------------------------------------------------------------------------"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"message\":\"hola, busco una mochila\"}")

echo "✅ Response:"
echo "$RESPONSE" | jq -r '.response' | sed 's/^/   /'
echo ""
echo "📦 Cart:"
CART_COUNT=$(echo "$RESPONSE" | jq '.cart | length')
echo "   $CART_COUNT items"
echo ""

# Message 2: Add to cart
echo "📨 Message 2: \"agrégame una al carrito\""
echo "--------------------------------------------------------------------------------"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"message\":\"agrégame una al carrito\"}")

echo "✅ Response:"
echo "$RESPONSE" | jq -r '.response' | sed 's/^/   /'
echo ""
echo "📦 Cart:"
CART_COUNT=$(echo "$RESPONSE" | jq '.cart | length')
echo "   $CART_COUNT items"
if [ "$CART_COUNT" -gt 0 ]; then
  echo "$RESPONSE" | jq -r '.cart[] | "   - \(.title) (qty: \(.quantity), price: \(.price))"'
fi
echo ""

# Message 3: Policy question
echo "📨 Message 3: \"¿cuál es la política de devoluciones?\""
echo "--------------------------------------------------------------------------------"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"message\":\"¿cuál es la política de devoluciones?\"}")

echo "✅ Response:"
echo "$RESPONSE" | jq -r '.response' | sed 's/^/   /'
echo ""

# Message 4: Checkout
echo "📨 Message 4: \"quiero pagar\""
echo "--------------------------------------------------------------------------------"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"message\":\"quiero pagar\"}")

echo "✅ Response:"
echo "$RESPONSE" | jq -r '.response' | sed 's/^/   /'
echo ""
echo "📦 Cart:"
CART_COUNT=$(echo "$RESPONSE" | jq '.cart | length')
echo "   $CART_COUNT items"
echo ""

echo "================================================================================"
echo "✅ END-TO-END TEST COMPLETE"
echo "================================================================================"
echo ""
