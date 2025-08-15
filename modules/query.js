const databaseModule = require('./database');

/**
 * Generate summary for a user based on their interactions
 */
async function generateSummary(senderId) {
  try {
    // Get recent interactions
    const interactions = await databaseModule.getUserInteractions(senderId, 20);
    const ocrResults = await databaseModule.getUserOCRResults(senderId, 10);
    
    if (interactions.length === 0 && ocrResults.length === 0) {
      return 'No data found for summary. Send some images or messages to get started!';
    }
    
    // Create summary statistics
    const stats = {
      totalInteractions: interactions.length,
      totalImages: interactions.filter(i => i.message_type === 'image').length,
      totalTexts: interactions.filter(i => i.message_type === 'text').length,
      totalOCRProcessed: ocrResults.length,
      avgConfidence: ocrResults.length > 0 
        ? (ocrResults.reduce((sum, r) => sum + (r.confidence || 0), 0) / ocrResults.length).toFixed(2)
        : 0
    };
    
    // Build summary text
    let summary = `📊 *Your Activity Summary*\n\n`;
    summary += `Total Interactions: ${stats.totalInteractions}\n`;
    summary += `Images Processed: ${stats.totalImages}\n`;
    summary += `Text Messages: ${stats.totalTexts}\n`;
    summary += `OCR Extractions: ${stats.totalOCRProcessed}\n`;
    
    if (stats.totalOCRProcessed > 0) {
      summary += `Average OCR Confidence: ${stats.avgConfidence}%\n\n`;
      
      // Add recent OCR texts
      summary += `*Recent Extracted Texts:*\n`;
      const recentOCR = ocrResults.slice(0, 3);
      recentOCR.forEach((ocr, index) => {
        const preview = ocr.extracted_text ? 
          ocr.extracted_text.substring(0, 50) + (ocr.extracted_text.length > 50 ? '...' : '') 
          : 'No text';
        summary += `${index + 1}. ${preview}\n`;
      });
    }
    
    // Store summary in database
    await databaseModule.insertSummary({
      senderId,
      summaryType: 'activity',
      summaryText: summary,
      dataCount: stats.totalInteractions
    });
    
    return summary;
  } catch (error) {
    console.error('Error generating summary:', error);
    return 'Error generating summary. Please try again.';
  }
}

/**
 * Get user's interaction history
 */
async function getUserHistory(senderId, limit = 10) {
  try {
    const interactions = await databaseModule.getUserInteractions(senderId, limit);
    
    if (interactions.length === 0) {
      return 'No history found. Start chatting to build your history!';
    }
    
    let history = `📜 *Your Recent History* (Last ${limit} interactions)\n\n`;
    
    interactions.forEach((interaction, index) => {
      const date = new Date(interaction.timestamp).toLocaleString();
      const type = interaction.message_type === 'image' ? '🖼️' : '💬';
      const content = interaction.content.substring(0, 30) + 
                     (interaction.content.length > 30 ? '...' : '');
      
      history += `${index + 1}. ${type} ${date}\n   ${content}\n\n`;
    });
    
    return history;
  } catch (error) {
    console.error('Error getting history:', error);
    return 'Error retrieving history. Please try again.';
  }
}

/**
 * Search OCR results for specific keywords
 */
async function searchOCRResults(senderId, keywords) {
  try {
    const ocrResults = await databaseModule.getUserOCRResults(senderId, 100);
    
    // Filter results containing keywords
    const matchedResults = ocrResults.filter(result => {
      const text = (result.extracted_text || '').toLowerCase();
      return keywords.some(keyword => text.includes(keyword.toLowerCase()));
    });
    
    if (matchedResults.length === 0) {
      return `No OCR results found containing: ${keywords.join(', ')}`;
    }
    
    let searchResult = `🔍 *Search Results* (${matchedResults.length} matches)\n\n`;
    
    matchedResults.slice(0, 5).forEach((result, index) => {
      const date = new Date(result.timestamp).toLocaleString();
      const preview = result.extracted_text.substring(0, 100) + 
                     (result.extracted_text.length > 100 ? '...' : '');
      
      searchResult += `${index + 1}. [${date}]\n${preview}\n\n`;
    });
    
    return searchResult;
  } catch (error) {
    console.error('Error searching OCR results:', error);
    return 'Error searching results. Please try again.';
  }
}

/**
 * Generate insights from user data
 */
async function generateInsights(senderId) {
  try {
    const interactions = await databaseModule.getUserInteractions(senderId, 50);
    const ocrResults = await databaseModule.getUserOCRResults(senderId, 50);
    
    // Time-based analysis
    const hourCounts = new Array(24).fill(0);
    interactions.forEach(interaction => {
      const hour = new Date(interaction.timestamp).getHours();
      hourCounts[hour]++;
    });
    
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    
    // Text analysis (simple word frequency)
    const wordFreq = {};
    ocrResults.forEach(result => {
      const words = (result.extracted_text || '').toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 3) { // Skip short words
          wordFreq[word] = (wordFreq[word] || 0) + 1;
        }
      });
    });
    
    // Get top words
    const topWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
    
    let insights = `💡 *Your Usage Insights*\n\n`;
    insights += `Most Active Hour: ${peakHour}:00 - ${peakHour + 1}:00\n`;
    insights += `Total Data Points: ${interactions.length + ocrResults.length}\n`;
    
    if (topWords.length > 0) {
      insights += `\nTop Keywords from OCR:\n`;
      topWords.forEach((word, index) => {
        insights += `${index + 1}. ${word}\n`;
      });
    }
    
    // Activity trend
    const recentActivity = interactions.filter(i => {
      const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
      return new Date(i.timestamp).getTime() > dayAgo;
    }).length;
    
    insights += `\nLast 24 Hours Activity: ${recentActivity} interactions`;
    
    return insights;
  } catch (error) {
    console.error('Error generating insights:', error);
    return 'Error generating insights. Please try again.';
  }
}

/**
 * Generate receipt summary from OCR data
 */
async function generateReceiptSummary(senderId) {
  try {
    const ocrResults = await databaseModule.getUserOCRResults(senderId, 20);
    
    // Filter for potential receipt data (containing numbers/amounts)
    const receipts = ocrResults.filter(result => {
      const text = result.extracted_text || '';
      return /\$?\d+\.?\d*/.test(text); // Contains price-like patterns
    });
    
    if (receipts.length === 0) {
      return 'No receipt data found. Upload receipt images to track expenses!';
    }
    
    let totalAmount = 0;
    const amounts = [];
    
    receipts.forEach(receipt => {
      const matches = receipt.extracted_text.match(/\$?(\d+\.?\d*)/g) || [];
      matches.forEach(match => {
        const amount = parseFloat(match.replace('$', ''));
        if (amount > 0 && amount < 10000) { // Reasonable amount range
          amounts.push(amount);
          totalAmount += amount;
        }
      });
    });
    
    let summary = `🧾 *Receipt Summary*\n\n`;
    summary += `Receipts Processed: ${receipts.length}\n`;
    summary += `Total Amounts Found: ${amounts.length}\n`;
    summary += `Sum of All Amounts: $${totalAmount.toFixed(2)}\n`;
    
    if (amounts.length > 0) {
      const avgAmount = totalAmount / amounts.length;
      const maxAmount = Math.max(...amounts);
      const minAmount = Math.min(...amounts);
      
      summary += `Average Amount: $${avgAmount.toFixed(2)}\n`;
      summary += `Highest Amount: $${maxAmount.toFixed(2)}\n`;
      summary += `Lowest Amount: $${minAmount.toFixed(2)}\n`;
    }
    
    return summary;
  } catch (error) {
    console.error('Error generating receipt summary:', error);
    return 'Error processing receipts. Please try again.';
  }
}

/**
 * Export user data for analytics
 */
async function exportUserData(senderId) {
  try {
    const interactions = await databaseModule.getUserInteractions(senderId, 1000);
    const ocrResults = await databaseModule.getUserOCRResults(senderId, 1000);
    
    const exportData = {
      userId: senderId,
      exportDate: new Date().toISOString(),
      statistics: {
        totalInteractions: interactions.length,
        totalOCRResults: ocrResults.length,
        dateRange: {
          start: interactions.length > 0 ? interactions[interactions.length - 1].timestamp : null,
          end: interactions.length > 0 ? interactions[0].timestamp : null
        }
      },
      interactions: interactions.map(i => ({
        type: i.message_type,
        content: i.content,
        timestamp: i.timestamp
      })),
      ocrData: ocrResults.map(o => ({
        text: o.extracted_text,
        confidence: o.confidence,
        timestamp: o.timestamp
      }))
    };
    
    return exportData;
  } catch (error) {
    console.error('Error exporting user data:', error);
    throw error;
  }
}

/**
 * Generate a business-focused summary showing sales stats and inventory insights
 */
async function generateBusinessSummary(senderId) {
  try {
    // Get sales data for last 30 days
    const salesData = await databaseModule.getSalesSummary(senderId, 30);
    
    // Get inventory items
    const inventoryItems = await databaseModule.getAllInventoryItems(senderId);
    
    // Get low stock items
    const lowStockItems = await databaseModule.getLowStockItems(senderId, 5);
    
    // Get expiring items in next 7 days
    const expiringItems = await databaseModule.getExpiringItems(senderId, 7);
    
    // If no data, return a simple message
    if (salesData.length === 0 && inventoryItems.length === 0) {
      return 'No sales or inventory data found. Start by adding items to your inventory!';
    }
    
    // Calculate total revenue and total items sold
    let totalRevenue = 0;
    let totalItemsSold = 0;
    salesData.forEach(sale => {
      totalRevenue += sale.total_revenue || 0;
      totalItemsSold += sale.total_sold || 0;
    });
    
    // Calculate inventory value
    let totalInventoryValue = 0;
    let totalInventoryItems = 0;
    inventoryItems.forEach(item => {
      const itemValue = (item.price || 0) * (item.quantity || 0);
      totalInventoryValue += itemValue;
      totalInventoryItems += (item.quantity || 0);
    });
    
    // Build summary text
    let summary = `📊 *BUSINESS SUMMARY*\n\n`;
    
    // Sales summary section
    summary += `💰 *SALES SUMMARY (Last 30 Days)*\n`;
    summary += `Total Revenue: ₱${totalRevenue.toFixed(2)}\n`;
    summary += `Total Items Sold: ${totalItemsSold}\n`;
    summary += `Transactions: ${salesData.length}\n\n`;
    
    // Top selling items
    if (salesData.length > 0) {
      summary += `🔝 *TOP SELLING ITEMS*\n`;
      const topItems = salesData
        .sort((a, b) => (b.total_sold || 0) - (a.total_sold || 0))
        .slice(0, 3);
        
      topItems.forEach((item, index) => {
        summary += `${index + 1}. ${item.item_name}: ${item.total_sold} units (₱${item.total_revenue.toFixed(2)})\n`;
      });
      summary += '\n';
      
      // Least selling items
      if (salesData.length > 3) {
        summary += `⬇️ *LEAST SELLING ITEMS*\n`;
        const leastItems = [...salesData]
          .sort((a, b) => (a.total_sold || 0) - (b.total_sold || 0))
          .slice(0, 3);
          
        leastItems.forEach((item, index) => {
          summary += `${index + 1}. ${item.item_name}: ${item.total_sold} units (₱${item.total_revenue.toFixed(2)})\n`;
        });
        summary += '\n';
      }
    }
    
    // Inventory summary
    summary += `📦 *INVENTORY SUMMARY*\n`;
    summary += `Total Items: ${inventoryItems.length}\n`;
    summary += `Total Units in Stock: ${totalInventoryItems}\n`;
    summary += `Inventory Value: ₱${totalInventoryValue.toFixed(2)}\n\n`;
    
    // Low stock alerts
    if (lowStockItems.length > 0) {
      summary += `⚠️ *LOW STOCK ALERTS*\n`;
      lowStockItems.forEach((item, index) => {
        summary += `${index + 1}. ${item.item_name}: ${item.quantity} ${item.unit} remaining\n`;
      });
      summary += '\n';
    }
    
    // Expiring items alerts
    if (expiringItems.length > 0) {
      summary += `⏱️ *EXPIRING SOON*\n`;
      expiringItems.forEach((item, index) => {
        const expiryDate = new Date(item.expiry_date).toLocaleDateString();
        summary += `${index + 1}. ${item.item_name}: ${item.quantity} ${item.unit} (Exp: ${expiryDate})\n`;
      });
      summary += '\n';
    }
    
    // Quick business insights
    if (salesData.length > 0 && inventoryItems.length > 0) {
      summary += `💡 *QUICK INSIGHTS*\n`;
      
      // Average daily sales
      const avgDailySales = totalRevenue / 30;
      summary += `• Avg. Daily Sales: ₱${avgDailySales.toFixed(2)}\n`;
      
      // Inventory turnover
      if (totalInventoryValue > 0) {
        const inventoryTurnover = totalRevenue / totalInventoryValue;
        summary += `• Inventory Turnover: ${inventoryTurnover.toFixed(2)}x\n`;
      }
      
      // Most profitable item
      if (salesData.length > 0) {
        const mostProfitable = salesData.sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0))[0];
        summary += `• Most Profitable: ${mostProfitable.item_name} (₱${mostProfitable.total_revenue.toFixed(2)})\n`;
      }
    }
    
    // Store summary in database
    await databaseModule.insertSummary({
      senderId,
      summaryType: 'business',
      summaryText: summary,
      dataCount: salesData.length + inventoryItems.length
    });
    
    return summary;
  } catch (error) {
    console.error('Error generating business summary:', error);
    return 'Error generating business summary. Please try again.';
  }
}

module.exports = {
  generateSummary,
  getUserHistory,
  searchOCRResults,
  generateInsights,
  generateReceiptSummary,
  generateBusinessSummary,
  exportUserData
};
