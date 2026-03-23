# Free-Tier Optimization Guide for Rag-Chatbot

This guide explains how to run the Rag-Chatbot on free-tier hosting services (Render and Vercel) with optimal performance and reliability.

## Overview

The application has been optimized for free-tier resource constraints:
- **Render (Server)**: 0.5 CPU, 512MB RAM, 100GB bandwidth/month
- **Vercel (Client)**: 100GB bandwidth/month, serverless functions with 10s timeout

## Key Optimizations Implemented

### 1. Rate Limiting (Free-Tier Friendly)
- **Limit**: 30 requests per minute per IP
- **Purpose**: Prevent abuse and reduce server load
- **Configuration**: Set in `server/src/config/env.js`

```javascript
rateLimitMax: 30, // requests per minute
rateLimitWindowMs: 60000, // 1 minute window
```

### 2. Database Connection Pooling
- **Pool Size**: 2 connections (minimal for free tier)
- **Idle Timeout**: 30 seconds
- **Purpose**: Reduce memory footprint and connection overhead

```javascript
maxPoolSize: 2,
minPoolSize: 1,
maxIdleTimeMS: 30000,
```

### 3. LLM Model Selection
- **Gemini**: `gemini-2.5-flash-lite` (faster, cheaper)
- **Claude**: `claude-3-haiku-20240307` (lightweight alternative)
- **Purpose**: Reduce API costs and response times

### 4. RAG Optimization
- **Top-K Chunks**: Reduced from 5 to 3
- **Purpose**: Lower memory usage and faster retrieval

### 5. Status Logs Caching
- **Cache TTL**: 5 minutes
- **Purpose**: Reduce database queries and improve response times
- **Enabled by default**: Set `CACHE_STATUS_LOGS=false` to disable

## Environment Variables for Free Tier

### Render (Backend)

```env
NODE_ENV=production
PORT=5001
CLIENT_URL=https://rag-chatbot-client-alpha.vercel.app
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/college_rag_chatbot
GOOGLE_API_KEY=your_google_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
JWT_SECRET=your_strong_secret_key
AGENT_USERNAME=agent
AGENT_PASSWORD=agent123
RATE_LIMIT_MAX=30
RAG_TOP_K=3
MONGO_POOL_SIZE=2
MONGO_MAX_IDLE_TIME=30000
CACHE_STATUS_LOGS=true
VECTOR_DB_PROVIDER=local
```

### Vercel (Frontend)

```env
VITE_API_BASE_URL=https://rag-chatbot-server.onrender.com/api
VITE_SOCKET_URL=https://rag-chatbot-server.onrender.com
```

## Deployment Steps

### 1. Deploy Server on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: `rag-chatbot-server`
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Add all variables from the Render section above
5. Click "Create Web Service"

### 2. Deploy Client on Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New..." → "Project"
3. Import your GitHub repository
4. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Environment Variables**: Add VITE_API_BASE_URL and VITE_SOCKET_URL
5. Click "Deploy"

### 3. Update Render CLIENT_URL

After Vercel deployment, update the `CLIENT_URL` on Render to match your Vercel URL:
- Go to Render Dashboard → Select your service
- Settings → Environment → Update `CLIENT_URL`
- Redeploy the service

## Performance Tips

### For Render (Free Tier)

1. **Cold Starts**: First request after 15 minutes of inactivity may be slow (Render spins down free services)
   - Keep the service warm with periodic health checks
   - Consider upgrading to paid tier if this is critical

2. **Memory Management**:
   - Limit concurrent connections
   - Use efficient data structures
   - Clear old status logs periodically

3. **Database Optimization**:
   - Use MongoDB Atlas free tier (512MB storage)
   - Create indexes on frequently queried fields
   - Archive old logs to reduce storage

### For Vercel (Free Tier)

1. **Bundle Size**:
   - Current size: ~250KB gzipped
   - Optimize images and lazy-load components if needed

2. **API Calls**:
   - Implement request caching on the client
   - Batch API requests where possible

3. **Serverless Functions**:
   - Keep functions under 10 seconds
   - Use edge functions for static content

## Monitoring

### Check Server Status

```bash
curl https://rag-chatbot-server.onrender.com/api/health
```

### View Status Dashboard

Visit: `https://rag-chatbot-client-alpha.vercel.app/status`

## Troubleshooting

### Issue: Server Returns 503 Service Unavailable

**Cause**: Free tier Render service was spun down due to inactivity
**Solution**: 
- Wait 30 seconds for the service to restart
- Consider upgrading to paid tier
- Set up a monitoring service to keep it warm

### Issue: High Response Times

**Cause**: Database connection pool exhausted or LLM API slow
**Solution**:
- Reduce `RATE_LIMIT_MAX` further
- Increase `MONGO_POOL_SIZE` if possible
- Switch to faster LLM model

### Issue: Out of Memory Error

**Cause**: Too many concurrent requests or large data processing
**Solution**:
- Reduce `RAG_TOP_K` further
- Enable `CACHE_STATUS_LOGS`
- Implement request queuing

## Scaling Beyond Free Tier

When ready to scale:

1. **Render**: Upgrade to Starter ($7/month) or higher
2. **Vercel**: Upgrade to Pro ($20/month) for better performance
3. **Database**: Move to MongoDB Atlas paid tier
4. **LLM APIs**: Consider self-hosted models or dedicated inference services

## Cost Estimation (Current Setup)

- **Render Free**: $0/month
- **Vercel Free**: $0/month
- **MongoDB Atlas Free**: $0/month
- **Google Gemini API**: ~$0.075 per 1M input tokens
- **Anthropic Claude API**: ~$0.80 per 1M input tokens

**Estimated Monthly Cost**: $0-5 (depending on usage)

## References

- [Render Pricing](https://render.com/pricing)
- [Vercel Pricing](https://vercel.com/pricing)
- [MongoDB Atlas Free Tier](https://www.mongodb.com/cloud/atlas/pricing)
- [Google Gemini Pricing](https://ai.google.dev/pricing)
- [Anthropic Claude Pricing](https://www.anthropic.com/pricing)
