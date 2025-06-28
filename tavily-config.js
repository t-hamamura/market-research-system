// Tavily Deep Research 設定
const TAVILY_CONFIG = {
  apiKey: process.env.TAVILY_API_KEY,
  maxResults: 5,
  searchDepth: "advanced",
  includeImages: true,
  includeAnswer: true
};

module.exports = TAVILY_CONFIG;
