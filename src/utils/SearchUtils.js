// 搜索工具函数
// 用于处理搜索相关的逻辑，如生成搜索建议等

/**
 * 生成搜索建议（普通搜索框）
 * @param {string} query - 搜索查询字符串
 * @param {Array} devices - 设备数据数组
 * @param {Array} searchHistory - 搜索历史数组
 * @param {number} limit - 建议数量限制
 * @returns {Array} 搜索建议数组
 * 注：普通搜索框只搜索器件名称和供应商编号
 */
export const generateSearchSuggestions = (
  query,
  devices,
  searchHistory,
  limit = 5
) => {
  if (!query || !query.trim()) {
    return [];
  }

  const lowerQuery = query.toLowerCase();
  const suggestions = [];

  // 从设备数据中生成建议（只基于名称）
  devices.forEach((device) => {
    if (
      device.name &&
      device.name.toLowerCase().includes(lowerQuery) &&
      !suggestions.includes(device.name)
    ) {
      suggestions.push(device.name);
    }
  });

  // 从搜索历史中生成建议
  searchHistory.forEach((item) => {
    if (
      item &&
      item.toLowerCase().includes(lowerQuery) &&
      !suggestions.includes(item)
    ) {
      suggestions.push(item);
    }
  });

  return suggestions.slice(0, limit);
};

/**
 * 过滤设备列表（普通搜索框）
 * @param {Array} devices - 设备数据数组
 * @param {string} searchQuery - 搜索查询字符串
 * @param {string} selectedShelf - 选中的器件架ID
 * @returns {Array} 过滤后的设备数组
 * 注：普通搜索框只搜索器件名称和供应商编号
 */
export const filterDevices = (devices, searchQuery, selectedShelf) => {
  let filtered = devices;

  // 首先根据器件架筛选
  if (selectedShelf) {
    filtered = filtered.filter((device) => device.shelfId === selectedShelf);
  }

  // 然后根据搜索查询筛选（只搜索器件名称和供应商编号）
  if (searchQuery && searchQuery.trim() !== '') {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter((device) => {
      return (
        (device.name && device.name.toLowerCase().includes(query)) ||
        (device.id && device.id.toString().toLowerCase().includes(query))
      );
    });
  }

  return filtered;
};
