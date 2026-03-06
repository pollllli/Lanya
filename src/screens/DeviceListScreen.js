import React, { useEffect, useMemo, useCallback, useReducer } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, TouchableOpacity, StyleSheet, Alert, TextInput, Modal, ScrollView, Animated, ActivityIndicator } from 'react-native';
import StorageService from '../services/StorageService';
import { logError, formatErrorMessage } from '../utils/ErrorHandler';
import { generateSearchSuggestions, filterDevices } from '../utils/SearchUtils';

const DeviceListScreen = ({ navigation, route, isAdmin = false }) => {
  // 初始状态
  const initialState = {
    devices: [],
    filteredDevices: [],
    searchQuery: '',
    selectedDevices: [],
    isSelectionMode: false,
    searchHistory: [],
    showSearchHistory: false,
    searchSuggestions: [],
    showSuggestions: false,
    showAdvancedSearch: false,
    advancedSearchParams: {
      name: '',
      function: '',
      resistance: '',
      voltage: '',
      capacitance: '',
      inductance: '',
      current: ''
    },
    successMessage: '',
    isConnected: false,
    isLoading: false,
    shelves: [
      { id: '1', name: '器件架 A' },
      { id: '2', name: '器件架 B' },
      { id: '3', name: '器件架 C' },
      { id: '4', name: '器件架 D' }
    ],
    selectedShelf: '',
    showShelfDropdown: false
  };

  // Reducer函数
  const reducer = (state, action) => {
    switch (action.type) {
      case 'SET_DEVICES':
        return { ...state, devices: action.payload, filteredDevices: action.payload };
      case 'SET_FILTERED_DEVICES':
        return { ...state, filteredDevices: action.payload };
      case 'SET_SEARCH_QUERY':
        return { ...state, searchQuery: action.payload };
      case 'SET_SELECTED_DEVICES':
        return { ...state, selectedDevices: action.payload };
      case 'SET_SELECTION_MODE':
        return { ...state, isSelectionMode: action.payload, selectedDevices: [] };
      case 'SET_SEARCH_HISTORY':
        return { ...state, searchHistory: action.payload };
      case 'SET_SHOW_SEARCH_HISTORY':
        return { ...state, showSearchHistory: action.payload };
      case 'SET_SEARCH_SUGGESTIONS':
        return { ...state, searchSuggestions: action.payload };
      case 'SET_SHOW_SUGGESTIONS':
        return { ...state, showSuggestions: action.payload };
      case 'SET_SHOW_ADVANCED_SEARCH':
        return { ...state, showAdvancedSearch: action.payload };
      case 'SET_ADVANCED_SEARCH_PARAMS':
        return { ...state, advancedSearchParams: action.payload };
      case 'SET_SUCCESS_MESSAGE':
        return { ...state, successMessage: action.payload };
      case 'SET_CONNECTED':
        return { ...state, isConnected: action.payload };
      case 'SET_SELECTED_SHELF':
        return { ...state, selectedShelf: action.payload };
      case 'SET_SHOW_SHELF_DROPDOWN':
        return { ...state, showShelfDropdown: action.payload };
      case 'TOGGLE_DEVICE_SELECTION':
        return {
          ...state,
          selectedDevices: state.selectedDevices.includes(action.payload)
            ? state.selectedDevices.filter(id => id !== action.payload)
            : [...state.selectedDevices, action.payload]
        };
      case 'RESET_ADVANCED_SEARCH':
        return {
          ...state,
          advancedSearchParams: initialState.advancedSearchParams
        };
      case 'CLEAR_SEARCH_HISTORY':
        return {
          ...state,
          searchHistory: []
        };
      case 'SET_LOADING':
        return {
          ...state,
          isLoading: action.payload
        };
      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(reducer, initialState);
  const successAnimation = useMemo(() => new Animated.Value(0), []);
  
  // 解构状态
  const {
    devices,
    filteredDevices,
    searchQuery,
    selectedDevices,
    isSelectionMode,
    searchHistory,
    showSearchHistory,
    searchSuggestions,
    showSuggestions,
    showAdvancedSearch,
    advancedSearchParams,
    successMessage,
    isConnected,
    isLoading,
    shelves,
    selectedShelf,
    showShelfDropdown
  } = state;

  useEffect(() => {
    loadDevices();
    loadSearchHistory();
    // 初始检查连接状态
    checkConnectionStatus();
  }, [loadDevices, loadSearchHistory, checkConnectionStatus]);

  // 当页面获得焦点时重新加载设备数据
  useFocusEffect(
    useCallback(() => {
      console.log('DeviceListScreen获得焦点，重新加载数据');
      loadDevices();
    }, [loadDevices])
  );

  // 定期检查连接状态，确保指示器实时更新
  useEffect(() => {
    const checkInterval = setInterval(() => {
      checkConnectionStatus();
    }, 1000); // 每秒检查一次

    return () => {
      clearInterval(checkInterval);
    };
  }, [checkConnectionStatus]);

  // 检查连接状态
  const checkConnectionStatus = useCallback(() => {
    const connected = !!global.deviceConnection;
    if (connected !== isConnected) {
      dispatch({ type: 'SET_CONNECTED', payload: connected });
    }
  }, [isConnected, dispatch]);

  const loadSearchHistory = useCallback(async () => {
    try {
      const storedHistory = await StorageService.getSearchHistory();
      if (storedHistory.length > 0) {
        dispatch({ type: 'SET_SEARCH_HISTORY', payload: storedHistory });
      }
    } catch (error) {
      logError('加载搜索历史失败', error, 'DeviceListScreen.loadSearchHistory');
    }
  }, [dispatch]);

  const saveSearchHistory = useCallback(async (query) => {
    if (!query.trim()) return;
    
    try {
      let updatedHistory = searchHistory.filter(item => item !== query);
      updatedHistory.unshift(query);
      updatedHistory = updatedHistory.slice(0, 10); // 只保留最近10条
      dispatch({ type: 'SET_SEARCH_HISTORY', payload: updatedHistory });
      await StorageService.saveSearchHistory(updatedHistory);
    } catch (error) {
      logError('保存搜索历史失败', error, 'DeviceListScreen.saveSearchHistory');
    }
  }, [searchHistory, dispatch]);

  const clearSearchHistory = useCallback(async () => {
    try {
      dispatch({ type: 'CLEAR_SEARCH_HISTORY' });
      await StorageService.clearSearchHistory();
    } catch (error) {
      logError('清除搜索历史失败', error, 'DeviceListScreen.clearSearchHistory');
    }
  }, [dispatch]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      dispatch({ type: 'SET_FILTERED_DEVICES', payload: devices });
      dispatch({ type: 'SET_SHOW_SUGGESTIONS', payload: false });
    } else {
      // 生成搜索建议
      handleGenerateSearchSuggestions(searchQuery);
      
      const filtered = filterDevices(devices, searchQuery, selectedShelf);
      dispatch({ type: 'SET_FILTERED_DEVICES', payload: filtered });
    }
  }, [devices, searchQuery, selectedShelf, handleGenerateSearchSuggestions, dispatch]);

  const handleGenerateSearchSuggestions = useCallback((query) => {
    if (!query.trim()) {
      dispatch({ type: 'SET_SEARCH_SUGGESTIONS', payload: [] });
      dispatch({ type: 'SET_SHOW_SUGGESTIONS', payload: false });
      return;
    }

    const suggestions = generateSearchSuggestions(query, devices, searchHistory, 5);
    dispatch({ type: 'SET_SEARCH_SUGGESTIONS', payload: suggestions });
    dispatch({ type: 'SET_SHOW_SUGGESTIONS', payload: suggestions.length > 0 });
  }, [devices, searchHistory, dispatch]);

  const handleSearch = useCallback((query) => {
    dispatch({ type: 'SET_SEARCH_QUERY', payload: query });
    saveSearchHistory(query);
    dispatch({ type: 'SET_SHOW_SEARCH_HISTORY', payload: false });
    dispatch({ type: 'SET_SHOW_SUGGESTIONS', payload: false });
  }, [saveSearchHistory, dispatch]);

  const loadDevices = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      // 先尝试从存储中读取数据
      const storedDevices = await StorageService.getDevices();
      
      if (storedDevices.length > 0) {
        // 如果存储中有数据，使用存储的数据
        console.log('从存储加载器件数据，共', storedDevices.length, '个器件');
        dispatch({ type: 'SET_DEVICES', payload: storedDevices });
      } else {
        // 如果存储中没有数据，使用默认数据
        console.log('存储中无数据，使用默认器件数据');
        const defaultDevices = [
          { id: 1, name: '10Ω电阻器', function: '限流、分压', resistance: '10Ω', voltage: '5V', shelfId: '1' },
          { id: 2, name: '10μF电容器', function: '储能、滤波', capacitance: '10μF', voltage: '16V', shelfId: '1' },
          { id: 3, name: '10mH电感器', function: '储能、滤波', inductance: '10mH', current: '1A', shelfId: '1' },
          { id: 4, name: '1N4007二极管', function: '单向导电', voltage: '1000V', current: '2A', shelfId: '1' },
          { id: 5, name: '2N2222三极管', function: '放大、开关', voltage: '40V', current: '500mA', shelfId: '2' },
          { id: 6, name: '74HC00集成电路', function: '信号处理', voltage: '3.3V', current: '100mA', shelfId: '2' },
          { id: 7, name: '5V继电器', function: '电气控制', voltage: '5V', current: '10A', shelfId: '2' },
          { id: 8, name: '单极开关', function: '电路控制', voltage: '250V', current: '16A', shelfId: '2' },
          { id: 9, name: '5A保险丝', function: '过载保护', voltage: '250V', current: '5A', shelfId: '3' },
          { id: 10, name: '10kΩ电位器', function: '调节电阻', resistance: '10kΩ', voltage: '25V', shelfId: '3' },
          { id: 11, name: '220V/12V变压器', function: '电压转换', voltage: '220V/12V', current: '2A', shelfId: '3' },
          { id: 12, name: '16MHz晶振', function: '时钟信号', frequency: '16MHz', voltage: '3.3V', shelfId: '3' },
          { id: 13, name: '红色LED', function: '发光指示', voltage: '3.3V', current: '20mA', shelfId: '4' },
          { id: 14, name: '5V蜂鸣器', function: '声音提示', voltage: '5V', current: '100mA', shelfId: '4' },
          { id: 15, name: '温度传感器', function: '信号检测', voltage: '5V', current: '50mA', shelfId: '4' },
        ];
        await StorageService.saveDevices(defaultDevices);
        dispatch({ type: 'SET_DEVICES', payload: defaultDevices });
      }
      // memoizedFilteredDevices会自动根据selectedShelf重新计算
    } catch (error) {
      logError('加载器件数据失败', error, 'DeviceListScreen.loadDevices');
      const errorMessage = `加载器件数据失败: ${formatErrorMessage(error)}`;
      Alert.alert('错误', errorMessage);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [dispatch]);

  // 根据器件架筛选设备
  const filterDevicesByShelf = useCallback((devicesList, shelfId) => {
    const filtered = devicesList.filter(device => device.shelfId === shelfId);
    dispatch({ type: 'SET_FILTERED_DEVICES', payload: filtered });
  }, [dispatch]);

  // 请求器件
  const requestDevice = useCallback(async (device) => {
    try {
      // 检查是否有蓝牙连接
      if (!isConnected || !global.deviceConnection) {
        Alert.alert('提示', '请先在连接页面连接蓝牙设备');
        return;
      }

      // 构建请求命令 - 使用requestDevice命令并指定具体的器件ID
      const requestCommand = {
        type: 'requestDevice',
        deviceId: device.id
      };

      // 使用全局蓝牙连接发送命令
      const { handler } = global.deviceConnection;
      const response = await handler.sendCommand(requestCommand);

      if (response.success) {
        Alert.alert('成功', `已发送器件请求: ${device.name}`);
        showSuccessMessage(`已请求器件: ${device.name}`);
      } else {
        Alert.alert('错误', `请求器件失败: ${response.message}`);
      }
    } catch (error) {
      logError('请求器件失败', error, 'DeviceListScreen.requestDevice');
      const errorMessage = `请求器件失败: ${formatErrorMessage(error)}`;
      Alert.alert('错误', errorMessage);
    }
  }, [isConnected, showSuccessMessage]);

  // 使用 useMemo 缓存过滤后的设备列表
  const memoizedFilteredDevices = useMemo(() => {
    return filterDevices(devices, searchQuery, selectedShelf);
  }, [devices, searchQuery, selectedShelf]);

  // 使用 useMemo 缓存搜索建议
  const memoizedSearchSuggestions = useMemo(() => {
    return generateSearchSuggestions(searchQuery, devices, searchHistory, 5);
  }, [devices, searchHistory, searchQuery]);

  const handleDevicePress = useCallback((device) => {
    navigation.navigate('DeviceDetail', { device, isAdmin });
  }, [navigation, isAdmin]);

  // 单个器件删除
  const handleDeleteDevice = useCallback(async (device) => {
    Alert.alert(
      '确认删除',
      `确定要删除器件 "${device.name}" 吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedDevices = devices.filter(d => d.id !== device.id);
              await StorageService.saveDevices(updatedDevices);
              dispatch({ type: 'SET_DEVICES', payload: updatedDevices });
              showSuccessMessage('器件已删除');
              Alert.alert('成功', '器件已删除');
            } catch (error) {
              logError('删除器件失败', error, 'DeviceListScreen.handleDeleteDevice');
              Alert.alert('错误', '删除器件失败');
            }
          }
        }
      ]
    );
  }, [devices, dispatch, showSuccessMessage]);

  // 批量删除器件
  const handleBatchDelete = useCallback(() => {
    if (selectedDevices.length === 0) {
      Alert.alert('提示', '请先选择要删除的器件');
      return;
    }

    Alert.alert(
      '确认删除',
      `确定要删除选中的 ${selectedDevices.length} 个器件吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedDevices = devices.filter(d => !selectedDevices.includes(d.id));
              await StorageService.saveDevices(updatedDevices);
              dispatch({ type: 'SET_DEVICES', payload: updatedDevices });
              dispatch({ type: 'SET_SELECTION_MODE', payload: false });
              showSuccessMessage(`已删除 ${selectedDevices.length} 个器件`);
            } catch (error) {
              logError('批量删除器件失败', error, 'DeviceListScreen.handleBatchDelete');
              Alert.alert('错误', '删除器件失败');
            }
          }
        }
      ]
    );
  }, [selectedDevices, devices, dispatch, showSuccessMessage]);

  // 切换选择模式
  const toggleSelectionMode = useCallback(() => {
    dispatch({ type: 'SET_SELECTION_MODE', payload: !isSelectionMode });
  }, [isSelectionMode, dispatch]);

  // 切换器件选择状态
  const toggleDeviceSelection = useCallback((deviceId) => {
    dispatch({ type: 'TOGGLE_DEVICE_SELECTION', payload: deviceId });
  }, [dispatch]);

  const handleAdvancedSearch = useCallback(() => {
    const filtered = devices.filter(device => {
      let match = true;
      
      if (advancedSearchParams.name) {
        match = match && device.name.toLowerCase().includes(advancedSearchParams.name.toLowerCase());
      }
      if (advancedSearchParams.function) {
        match = match && device.function.toLowerCase().includes(advancedSearchParams.function.toLowerCase());
      }
      if (advancedSearchParams.resistance) {
        match = match && device.resistance && device.resistance.toLowerCase().includes(advancedSearchParams.resistance.toLowerCase());
      }
      if (advancedSearchParams.voltage) {
        match = match && device.voltage && device.voltage.toLowerCase().includes(advancedSearchParams.voltage.toLowerCase());
      }
      if (advancedSearchParams.capacitance) {
        match = match && device.capacitance && device.capacitance.toLowerCase().includes(advancedSearchParams.capacitance.toLowerCase());
      }
      if (advancedSearchParams.inductance) {
        match = match && device.inductance && device.inductance.toLowerCase().includes(advancedSearchParams.inductance.toLowerCase());
      }
      if (advancedSearchParams.current) {
        match = match && device.current && device.current.toLowerCase().includes(advancedSearchParams.current.toLowerCase());
      }
      
      return match;
    });
    
    dispatch({ type: 'SET_FILTERED_DEVICES', payload: filtered });
    dispatch({ type: 'SET_SHOW_ADVANCED_SEARCH', payload: false });
  }, [devices, advancedSearchParams, dispatch]);

  const resetAdvancedSearch = useCallback(() => {
    dispatch({ type: 'RESET_ADVANCED_SEARCH' });
  }, [dispatch]);

  // 显示成功反馈
  const showSuccessMessage = useCallback((message) => {
    dispatch({ type: 'SET_SUCCESS_MESSAGE', payload: message });
    
    // 动画显示
    Animated.sequence([
      Animated.timing(successAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(2000),
      Animated.timing(successAnimation, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      dispatch({ type: 'SET_SUCCESS_MESSAGE', payload: '' });
    });
  }, [dispatch, successAnimation]);

  const renderDeviceItem = useCallback(({ item }) => {
    const isSelected = selectedDevices.includes(item.id);
    
    const handlePress = () => {
      if (isSelectionMode) {
        toggleDeviceSelection(item.id);
      } else {
        handleDevicePress(item);
      }
    };
    
    return (
      <TouchableOpacity 
        style={[styles.deviceTag, isSelected && styles.selectedDeviceTag]} 
        onPress={handlePress}
      >
        {isSelectionMode && (
          <View style={styles.checkboxContainer}>
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </View>
        )}
        <View style={styles.deviceTagContent}>
          <View style={styles.tagRow}>
            <Text style={styles.deviceTagId}>{item.supplierId || item.id || 'N/A'}</Text>
            <Text style={styles.deviceTagCategory}>{item.category || '未分类'}</Text>
          </View>
          <View style={styles.tagNameContainer}>
            <Text style={styles.deviceTagName}>{item.name || '未命名'}</Text>
          </View>
          <View style={styles.tagPackageContainer}>
            <Text style={styles.deviceTagPackage}>{item.package || 'N/A'}</Text>
          </View>
          {/* 请求器件按钮 */}
          <TouchableOpacity 
            style={styles.requestButton}
            onPress={() => requestDevice(item)}
          >
            <Text style={styles.requestButtonText}>请求器件</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }, [selectedDevices, isSelectionMode, toggleDeviceSelection, handleDevicePress, requestDevice]);

  // 上架器件功能
  const handleAddDevice = useCallback(() => {
    navigation.navigate('AdminEdit', {
      device: {},
      isNew: true,
      onSave: loadDevices,
    });
  }, [navigation, loadDevices]);

  // 处理器件架选择
  const handleShelfSelect = useCallback((shelfId) => {
    // 如果点击的是已选中的器件架，则取消选择，显示所有设备
    if (shelfId === selectedShelf) {
      dispatch({ type: 'SET_SELECTED_SHELF', payload: '' });
    } else {
      dispatch({ type: 'SET_SELECTED_SHELF', payload: shelfId });
    }
    dispatch({ type: 'SET_SHOW_SHELF_DROPDOWN', payload: false });
    // 不再需要手动更新filteredDevices，memoizedFilteredDevices会自动根据selectedShelf重新计算
  }, [selectedShelf, dispatch]);

  return (
    <View style={styles.container}>
      {/* 器件架选择 */}
      <View style={styles.shelfSelectorContainer}>
        <TouchableOpacity 
          style={styles.shelfSelector} 
          onPress={() => dispatch({ type: 'SET_SHOW_SHELF_DROPDOWN', payload: !showShelfDropdown })}
        >
          <Text style={styles.shelfSelectorText}>
            {selectedShelf ? shelves.find(shelf => shelf.id === selectedShelf)?.name : '全部器件'}
          </Text>
          <Text style={styles.shelfSelectorArrow}>
            {showShelfDropdown ? '▲' : '▼'}
          </Text>
        </TouchableOpacity>
        
        {/* 蓝牙连接状态指示器 */}
        <View style={styles.connectionStatusContainer}>
          {isConnected ? (
            <View style={[styles.statusIndicator, styles.connectedIndicator]}>
              <Text style={styles.statusIcon}>🔵</Text>
              <Text style={styles.statusText}>已连接</Text>
            </View>
          ) : (
            <View style={[styles.statusIndicator, styles.disconnectedIndicator]}>
              <Text style={styles.statusIcon}>⚪</Text>
              <Text style={styles.statusText}>未连接</Text>
            </View>
          )}
        </View>
        
        {/* 器件架下拉菜单 */}
        {showShelfDropdown && (
          <View style={styles.shelfDropdown}>
            {shelves.map(shelf => (
              <TouchableOpacity
                key={shelf.id}
                style={[
                  styles.shelfDropdownItem,
                  selectedShelf === shelf.id && styles.shelfDropdownItemSelected
                ]}
                onPress={() => handleShelfSelect(shelf.id)}
              >
                <Text style={[
                  styles.shelfDropdownItemText,
                  selectedShelf === shelf.id && styles.shelfDropdownItemTextSelected
                ]}>
                  {shelf.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* 搜索容器 */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <TextInput
            style={styles.searchInput}
            placeholder="搜索器件名称、功能或编号..."
            value={searchQuery}
            onChangeText={(text) => dispatch({ type: 'SET_SEARCH_QUERY', payload: text })}
            onFocus={() => dispatch({ type: 'SET_SHOW_SEARCH_HISTORY', payload: true })}
          />
          <TouchableOpacity 
            style={styles.advancedSearchButton}
            onPress={() => dispatch({ type: 'SET_SHOW_ADVANCED_SEARCH', payload: true })}
          >
            <Text style={styles.advancedSearchButtonText}>高级</Text>
          </TouchableOpacity>
        </View>
        
        {/* 搜索历史 */}
        {showSearchHistory && searchHistory.length > 0 && (
          <View style={styles.searchHistoryContainer}>
            <View style={styles.searchHistoryHeader}>
              <Text style={styles.searchHistoryTitle}>搜索历史</Text>
              <TouchableOpacity onPress={clearSearchHistory}>
                <Text style={styles.clearHistoryButton}>清除</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {searchHistory.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.historyTag}
                  onPress={() => handleSearch(item)}
                >
                  <Text style={styles.historyTagText}>{item}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
        
        {/* 搜索建议 */}
        {showSuggestions && memoizedSearchSuggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            {memoizedSearchSuggestions.map((suggestion, index) => (
              <TouchableOpacity
                key={index}
                style={styles.suggestionItem}
                onPress={() => handleSearch(suggestion)}
              >
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* 管理员专属按钮 */}
      {isAdmin && (
        <View style={styles.adminButtonsContainer}>
          {isSelectionMode ? (
            <>
              <TouchableOpacity style={styles.cancelButton} onPress={toggleSelectionMode}>
                <Text style={styles.cancelButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.deleteButton, selectedDevices.length === 0 && styles.disabledButton]} 
                onPress={handleBatchDelete}
                disabled={selectedDevices.length === 0}
              >
                <Text style={styles.deleteButtonText}>删除 ({selectedDevices.length})</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.addButton} onPress={handleAddDevice}>
                <Text style={styles.addButtonText}>上架器件</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.selectButton} onPress={toggleSelectionMode}>
                <Text style={styles.selectButtonText}>批量选择</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
      
      {/* 设备标签列表 */}
      <ScrollView style={styles.tagsContainer} showsVerticalScrollIndicator={true}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1976d2" />
            <Text style={styles.loadingText}>加载器件数据中...</Text>
          </View>
        ) : memoizedFilteredDevices.length > 0 ? (
          <View style={styles.tagsGrid}>
            {memoizedFilteredDevices.map((item) => (
              <View key={item.id} style={styles.tagWrapper}>
                {renderDeviceItem({ item })}
              </View>
            ))}
            {/* 添加一个底部空白，确保最后一行标签完全可见 */}
            <View style={{ height: 20 }} />
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Text style={styles.emptyIcon}>🔍</Text>
            </View>
            <Text style={styles.emptyTitle}>
              {searchQuery.trim() ? '未找到匹配的器件' : '暂无器件数据'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery.trim() 
                ? '请尝试使用其他关键词搜索，或检查拼写是否正确' 
                : '当前器件架中还没有器件'}
            </Text>
          </View>
        )}
      </ScrollView>
      
      {/* 高级搜索模态框 */}
      <Modal
        visible={showAdvancedSearch}
        animationType="slide"
        transparent={true}
        onRequestClose={() => dispatch({ type: 'SET_SHOW_ADVANCED_SEARCH', payload: false })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>高级搜索</Text>
            
            <ScrollView style={styles.advancedSearchScroll}>
              <View style={styles.advancedSearchInputContainer}>
                <Text style={styles.advancedSearchLabel}>器件名称</Text>
                <TextInput
                  style={styles.advancedSearchInput}
                  value={advancedSearchParams.name}
                  onChangeText={(text) => dispatch({ type: 'SET_ADVANCED_SEARCH_PARAMS', payload: {...advancedSearchParams, name: text} })}
                  placeholder="输入器件名称"
                />
              </View>
              
              <View style={styles.advancedSearchInputContainer}>
                <Text style={styles.advancedSearchLabel}>功能描述</Text>
                <TextInput
                  style={styles.advancedSearchInput}
                  value={advancedSearchParams.function}
                  onChangeText={(text) => dispatch({ type: 'SET_ADVANCED_SEARCH_PARAMS', payload: {...advancedSearchParams, function: text} })}
                  placeholder="输入功能描述"
                />
              </View>
              
              <View style={styles.advancedSearchInputContainer}>
                <Text style={styles.advancedSearchLabel}>电阻</Text>
                <TextInput
                  style={styles.advancedSearchInput}
                  value={advancedSearchParams.resistance}
                  onChangeText={(text) => dispatch({ type: 'SET_ADVANCED_SEARCH_PARAMS', payload: {...advancedSearchParams, resistance: text} })}
                  placeholder="输入电阻值"
                />
              </View>
              
              <View style={styles.advancedSearchInputContainer}>
                <Text style={styles.advancedSearchLabel}>电压</Text>
                <TextInput
                  style={styles.advancedSearchInput}
                  value={advancedSearchParams.voltage}
                  onChangeText={(text) => dispatch({ type: 'SET_ADVANCED_SEARCH_PARAMS', payload: {...advancedSearchParams, voltage: text} })}
                  placeholder="输入电压值"
                />
              </View>
              
              <View style={styles.advancedSearchInputContainer}>
                <Text style={styles.advancedSearchLabel}>电容</Text>
                <TextInput
                  style={styles.advancedSearchInput}
                  value={advancedSearchParams.capacitance}
                  onChangeText={(text) => dispatch({ type: 'SET_ADVANCED_SEARCH_PARAMS', payload: {...advancedSearchParams, capacitance: text} })}
                  placeholder="输入电容值"
                />
              </View>
              
              <View style={styles.advancedSearchInputContainer}>
                <Text style={styles.advancedSearchLabel}>电感</Text>
                <TextInput
                  style={styles.advancedSearchInput}
                  value={advancedSearchParams.inductance}
                  onChangeText={(text) => dispatch({ type: 'SET_ADVANCED_SEARCH_PARAMS', payload: {...advancedSearchParams, inductance: text} })}
                  placeholder="输入电感值"
                />
              </View>
              
              <View style={styles.advancedSearchInputContainer}>
                <Text style={styles.advancedSearchLabel}>电流</Text>
                <TextInput
                  style={styles.advancedSearchInput}
                  value={advancedSearchParams.current}
                  onChangeText={(text) => dispatch({ type: 'SET_ADVANCED_SEARCH_PARAMS', payload: {...advancedSearchParams, current: text} })}
                  placeholder="输入电流值"
                />
              </View>
            </ScrollView>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  resetAdvancedSearch();
                  dispatch({ type: 'SET_SHOW_ADVANCED_SEARCH', payload: false });
                }}
              >
                <Text style={styles.modalButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalSearchButton]}
                onPress={handleAdvancedSearch}
              >
                <Text style={styles.modalButtonText}>搜索</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* 成功反馈提示 */}
      {successMessage && (
        <Animated.View 
          style={[
            styles.successMessageContainer,
            {
              transform: [
                {
                  translateY: successAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-100, 0],
                  }),
                },
              ],
              opacity: successAnimation,
            },
          ]}
        >
          <Text style={styles.successMessageIcon}>✅</Text>
          <Text style={styles.successMessageText}>{successMessage}</Text>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  // 器件架选择器样式
  shelfSelectorContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    position: 'relative',
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shelfSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    flex: 1,
    marginRight: 12,
  },
  // 连接状态指示器样式
  connectionStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectedIndicator: {
    backgroundColor: '#e8f5e8',
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  disconnectedIndicator: {
    backgroundColor: '#ffebee',
    borderWidth: 1,
    borderColor: '#ffcdd2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  statusIcon: {
    fontSize: 14,
  },
  shelfSelectorText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  shelfSelectorArrow: {
    fontSize: 14,
    color: '#666',
  },
  shelfDropdown: {
    position: 'absolute',
    top: '100%',
    left: 16,
    right: 16,
    marginTop: 8,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 200,
  },
  shelfDropdownItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  shelfDropdownItemSelected: {
    backgroundColor: '#e3f2fd',
  },
  shelfDropdownItemText: {
    fontSize: 16,
    color: '#333',
  },
  shelfDropdownItemTextSelected: {
    color: '#1976d2',
    fontWeight: '600',
  },
  // 搜索容器样式
  searchContainer: {
    padding: 16,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    fontSize: 16,
    marginRight: 10,
  },
  advancedSearchButton: {
    backgroundColor: '#1976d2',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  advancedSearchButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  searchHistoryContainer: {
    marginTop: 8,
  },
  searchHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  searchHistoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  clearHistoryButton: {
    fontSize: 14,
    color: '#1976d2',
  },
  historyTag: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  historyTagText: {
    fontSize: 14,
    color: '#1976d2',
  },
  suggestionsContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginTop: 8,
  },
  suggestionItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  suggestionText: {
    fontSize: 16,
    color: '#333',
  },
  // 模态框样式
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  advancedSearchScroll: {
    maxHeight: 400,
  },
  advancedSearchInputContainer: {
    marginBottom: 16,
  },
  advancedSearchLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  advancedSearchInput: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#8E8E93',
    marginRight: 8,
  },
  modalSearchButton: {
    backgroundColor: '#007AFF',
    marginLeft: 8,
  },
  modalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // 管理员按钮样式
  adminButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  selectButton: {
    backgroundColor: '#FF9500',
    flex: 1,
    marginLeft: 8,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  selectButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#8E8E93',
    flex: 1,
    marginRight: 8,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    flex: 1,
    marginLeft: 8,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.5,
  },
  // 设备标签样式
  tagsContainer: {
    flex: 1,
    padding: 16,
  },
  tagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tagWrapper: {
    width: '48%',
    marginBottom: 16,
  },
  deviceTag: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    minHeight: 140,
    justifyContent: 'center',
  },
  selectedDeviceTag: {
    backgroundColor: '#e3f2fd',
    borderWidth: 2,
    borderColor: '#1976d2',
  },
  deviceTagContent: {
    flex: 1,
    padding: 16,
  },
  tagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tagNameContainer: {
    marginBottom: 12,
  },
  tagPackageContainer: {
    marginBottom: 16,
  },
  deviceTagId: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  deviceTagCategory: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  deviceTagName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  deviceTagPackage: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  tagBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1976d2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: '#007AFF',
    flex: 1,
    marginRight: 8,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // 复选框样式
  checkboxContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  checkboxSelected: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  checkmark: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // 空状态样式
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 300,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 300,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  // 成功消息样式
  successMessageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#4CD964',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
  },
  successMessageIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  successMessageText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // 请求器件按钮样式
  requestButton: {
    backgroundColor: '#4caf50',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  requestButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default DeviceListScreen;