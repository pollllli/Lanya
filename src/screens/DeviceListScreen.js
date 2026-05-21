import React, {
  useEffect,
  useMemo,
  useCallback,
  useReducer,
  useRef,
} from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  Animated,
  ActivityIndicator,
} from 'react-native';
import StorageService from '../services/StorageService';
import { logError, formatErrorMessage } from '../utils/ErrorHandler';
import { generateSearchSuggestions, filterDevices } from '../utils/SearchUtils';
import { MaterialIcons } from '@expo/vector-icons';

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
      category: '',
      function: '',
      resistance: '',
      voltage: '',
      capacitance: '',
      inductance: '',
      current: '',
      package: '',
    },
    isAdvancedSearchMode: false,
    successMessage: '',
    isConnected: false,
    isLoading: false,
    litDeviceIds: [],
  };

  // Reducer函数
  const reducer = (state, action) => {
    switch (action.type) {
      case 'SET_DEVICES':
        return {
          ...state,
          devices: action.payload,
          filteredDevices: action.payload,
        };
      case 'SET_FILTERED_DEVICES':
        return { ...state, filteredDevices: action.payload };
      case 'SET_SEARCH_QUERY':
        return { ...state, searchQuery: action.payload };
      case 'SET_SELECTED_DEVICES':
        return { ...state, selectedDevices: action.payload };
      case 'SET_SELECTION_MODE':
        return {
          ...state,
          isSelectionMode: action.payload,
          selectedDevices: [],
        };
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
      case 'TOGGLE_DEVICE_SELECTION':
        return {
          ...state,
          selectedDevices: state.selectedDevices.includes(action.payload)
            ? state.selectedDevices.filter((id) => id !== action.payload)
            : [...state.selectedDevices, action.payload],
        };
      case 'RESET_ADVANCED_SEARCH':
        return {
          ...state,
          advancedSearchParams: initialState.advancedSearchParams,
          isAdvancedSearchMode: false,
        };
      case 'SET_ADVANCED_SEARCH_MODE':
        return {
          ...state,
          isAdvancedSearchMode: action.payload,
        };
      case 'CLEAR_SEARCH_HISTORY':
        return {
          ...state,
          searchHistory: [],
        };
      case 'SET_LOADING':
        return {
          ...state,
          isLoading: action.payload,
        };
      case 'SET_LIT_DEVICE_IDS':
        return {
          ...state,
          litDeviceIds: action.payload,
        };
      case 'TOGGLE_LIT_DEVICE':
        const isLit = state.litDeviceIds.includes(action.payload);
        return {
          ...state,
          litDeviceIds: isLit
            ? state.litDeviceIds.filter((id) => id !== action.payload)
            : [...state.litDeviceIds, action.payload],
        };
      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(reducer, initialState);
  const successAnimation = useMemo(() => new Animated.Value(0), []);
  const lastConnectedStatus = useRef(false);

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
    isAdvancedSearchMode,
    successMessage,
    isConnected,
    isLoading,
    litDeviceIds,
  } = state;

  useEffect(() => {
    loadDevices();
    loadSearchHistory();
    checkConnectionStatus();

    // 注册蓝牙断开回调（使用命名函数便于清理）
    const handleBluetoothDisconnected = () => {
      console.log('收到蓝牙断开通知，更新连接状态');
      dispatch({ type: 'SET_CONNECTED', payload: false });
    };

    // 保存旧的回调（如果有）
    const previousCallback = global.onBluetoothDisconnected;
    global.onBluetoothDisconnected = handleBluetoothDisconnected;

    // 清理回调
    return () => {
      // 恢复之前的回调（如果有的话）
      if (previousCallback) {
        global.onBluetoothDisconnected = previousCallback;
      } else {
        delete global.onBluetoothDisconnected;
      }
    };
  }, []);

  // 当页面获得焦点时重新加载设备数据，并保留搜索状态
  useFocusEffect(
    useCallback(() => {
      console.log('DeviceListScreen获得焦点，重新加载数据');
      
      // 保存当前搜索状态
      const currentSearchQuery = searchQuery;
      const currentAdvancedParams = { ...advancedSearchParams };
      const currentIsAdvancedMode = isAdvancedSearchMode;
      
      // 重新加载设备数据
      loadDevices();
      
      // 延迟执行，确保设备数据已加载完成
      setTimeout(() => {
        // 如果之前有搜索条件，重新应用
        if (currentIsAdvancedMode) {
          // 重新应用高级搜索
          const filtered = devices.filter((device) => {
            let match = true;
            if (currentAdvancedParams.category && currentAdvancedParams.category.trim() !== '') {
              const categoryQuery = currentAdvancedParams.category.toLowerCase();
              match = match && device.category && device.category.toLowerCase().includes(categoryQuery);
            }
            if (currentAdvancedParams.name) {
              match = match && device.name && device.name.toLowerCase().includes(currentAdvancedParams.name.toLowerCase());
            }
            if (currentAdvancedParams.function) {
              match = match && device.function && device.function.toLowerCase().includes(currentAdvancedParams.function.toLowerCase());
            }
            if (currentAdvancedParams.resistance) {
              match = match && device.resistance && device.resistance.toLowerCase().includes(currentAdvancedParams.resistance.toLowerCase());
            }
            if (currentAdvancedParams.voltage) {
              match = match && device.voltage && device.voltage.toLowerCase().includes(currentAdvancedParams.voltage.toLowerCase());
            }
            if (currentAdvancedParams.capacitance) {
              match = match && device.capacitance && device.capacitance.toLowerCase().includes(currentAdvancedParams.capacitance.toLowerCase());
            }
            if (currentAdvancedParams.inductance) {
              match = match && device.inductance && device.inductance.toLowerCase().includes(currentAdvancedParams.inductance.toLowerCase());
            }
            if (currentAdvancedParams.current) {
              match = match && device.current && device.current.toLowerCase().includes(currentAdvancedParams.current.toLowerCase());
            }
            if (currentAdvancedParams.package) {
              match = match && device.package && device.package.toLowerCase().includes(currentAdvancedParams.package.toLowerCase());
            }
            return match;
          });
          dispatch({ type: 'SET_FILTERED_DEVICES', payload: filtered });
          dispatch({ type: 'SET_ADVANCED_SEARCH_MODE', payload: true });
        } else if (currentSearchQuery.trim() !== '') {
          // 重新应用普通搜索
          const filtered = filterDevices(devices, currentSearchQuery, '');
          dispatch({ type: 'SET_FILTERED_DEVICES', payload: filtered });
        }
      }, 100);
    }, [searchQuery, advancedSearchParams, isAdvancedSearchMode, loadDevices, dispatch])
  );

  // 定期检查连接状态，确保指示器实时更新
  const checkConnectionStatusRef = useRef(checkConnectionStatus);

  useEffect(() => {
    checkConnectionStatusRef.current = checkConnectionStatus;
  }, [checkConnectionStatus]);

  useEffect(() => {
    const checkInterval = setInterval(() => {
      checkConnectionStatusRef.current();
    }, 1000); // 每秒检查一次

    return () => {
      clearInterval(checkInterval);
    };
  }, []);

  // 检查连接状态（优先检查全局连接对象，再检测蓝牙设备真实状态）
  const checkConnectionStatus = useCallback(async () => {
    let connected = false;
    let statusMessage = '';

    // 首先检查全局连接对象是否存在（蓝牙断开时会被清除）
    if (global.deviceConnection && global.deviceConnection.handler) {
      const handler = global.deviceConnection.handler;
      // 检查设备对象是否存在且已连接
      if (handler.connectedDevice) {
        try {
          // 直接调用设备的isConnected方法检测真实连接状态
          const isDeviceConnected = await handler.connectedDevice.isConnected();
          connected = isDeviceConnected;
          statusMessage = connected
            ? '已连接（设备在线）'
            : '已断开（设备离线）';
        } catch (error) {
          connected = false;
          statusMessage = '已断开（检测失败）';
        }
      }
    } else {
      // 全局连接对象已被清除，说明连接已断开
      connected = false;
      statusMessage = '已断开（全局连接对象已清除）';
    }

    // 只在连接状态发生变化时输出日志
    if (connected !== lastConnectedStatus.current) {
      console.log('蓝牙连接状态:', statusMessage);
      lastConnectedStatus.current = connected;
    }

    dispatch({ type: 'SET_CONNECTED', payload: connected });
  }, [dispatch]);

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

  const saveSearchHistory = useCallback(
    async (query) => {
      if (!query.trim()) return;

      try {
        let updatedHistory = searchHistory.filter((item) => item !== query);
        updatedHistory.unshift(query);
        updatedHistory = updatedHistory.slice(0, 10); // 只保留最近10条
        dispatch({ type: 'SET_SEARCH_HISTORY', payload: updatedHistory });
        await StorageService.saveSearchHistory(updatedHistory);
      } catch (error) {
        logError(
          '保存搜索历史失败',
          error,
          'DeviceListScreen.saveSearchHistory'
        );
      }
    },
    [searchHistory, dispatch]
  );

  const clearSearchHistory = useCallback(async () => {
    try {
      dispatch({ type: 'CLEAR_SEARCH_HISTORY' });
      await StorageService.clearSearchHistory();
    } catch (error) {
      logError(
        '清除搜索历史失败',
        error,
        'DeviceListScreen.clearSearchHistory'
      );
    }
  }, [dispatch]);

  const handleGenerateSearchSuggestionsRef = useRef(
    handleGenerateSearchSuggestions
  );

  useEffect(() => {
    handleGenerateSearchSuggestionsRef.current =
      handleGenerateSearchSuggestions;
  }, [handleGenerateSearchSuggestions]);

  useEffect(() => {
    if (searchQuery && searchQuery.trim() !== '') {
      handleGenerateSearchSuggestionsRef.current(searchQuery);
    } else {
      dispatch({ type: 'SET_SHOW_SUGGESTIONS', payload: false });
    }
  }, [searchQuery, dispatch]);

  const handleGenerateSearchSuggestions = useCallback(
    (query) => {
      if (!query || !query.trim()) {
        dispatch({ type: 'SET_SEARCH_SUGGESTIONS', payload: [] });
        dispatch({ type: 'SET_SHOW_SUGGESTIONS', payload: false });
        return;
      }

      const suggestions = generateSearchSuggestions(
        query,
        devices,
        searchHistory,
        5
      );
      dispatch({ type: 'SET_SEARCH_SUGGESTIONS', payload: suggestions });
      dispatch({
        type: 'SET_SHOW_SUGGESTIONS',
        payload: suggestions.length > 0,
      });
    },
    [devices, searchHistory, dispatch]
  );

  const handleSearch = useCallback(
    (query) => {
      dispatch({ type: 'SET_SEARCH_QUERY', payload: query });
      dispatch({ type: 'SET_ADVANCED_SEARCH_MODE', payload: false });
      saveSearchHistory(query);
      dispatch({ type: 'SET_SHOW_SEARCH_HISTORY', payload: false });
      dispatch({ type: 'SET_SHOW_SUGGESTIONS', payload: false });
    },
    [saveSearchHistory, dispatch]
  );

  const loadDevices = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      // 先尝试从存储中读取数据
      const storedDevices = await StorageService.getDevices();

      if (storedDevices.length > 0) {
        // 检查是否是旧的默认数据，如果是则清除
        const isOldDefaultData =
          storedDevices.length >= 10 && storedDevices[0]?.name?.includes('10Ω');
        if (isOldDefaultData) {
          console.log('检测到旧的默认数据，正在清除...');
          await StorageService.saveDevices([]);
          dispatch({ type: 'SET_DEVICES', payload: [] });
        } else {
          // 如果存储中有数据，使用存储的数据
          console.log('从存储加载器件数据，共', storedDevices.length, '个器件');
          const sortedDevices = [...storedDevices].sort((a, b) => {
            const posA = (a.location != null && a.location !== '') ? parseInt(a.location, 10) : 9999;
            const posB = (b.location != null && b.location !== '') ? parseInt(b.location, 10) : 9999;
            if (isNaN(posA) && isNaN(posB)) return 0;
            if (isNaN(posA)) return 1;
            if (isNaN(posB)) return -1;
            return posA - posB;
          });
          dispatch({ type: 'SET_DEVICES', payload: sortedDevices });
        }
      }
    } catch (error) {
      logError('加载器件数据失败', error, 'DeviceListScreen.loadDevices');
      const errorMessage = `加载器件数据失败: ${formatErrorMessage(error)}`;
      Alert.alert('错误', errorMessage);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [dispatch]);

  const handleDeviceTagPress = useCallback(
    async (device, hardwarePosition) => {
      try {
        if (!isConnected || !global.deviceConnection) {
          Alert.alert('提示', '请先在连接页面连接蓝牙设备');
          dispatch({ type: 'SET_CONNECTED', payload: false });
          return;
        }

        const { handler } = global.deviceConnection;
        const isLit = litDeviceIds.includes(device.id);

        if (isLit) {
          const response = await handler.sendCommand({
            type: 'lightOff',
            lightId: hardwarePosition,
          });

          if (response.success) {
            dispatch({
              type: 'SET_LIT_DEVICE_IDS',
              payload: litDeviceIds.filter((id) => id !== device.id),
            });
            showSuccessMessage(`已熄灯: ${device.name}`);
          } else {
            Alert.alert('错误', `熄灯失败: ${response.message}`);
          }
        } else {
          const response = await handler.sendCommand({
            type: 'lightOn',
            lightId: hardwarePosition,
          });

          if (response.success) {
            dispatch({ type: 'TOGGLE_LIT_DEVICE', payload: device.id });
            showSuccessMessage(`已亮灯: ${device.name} (位置: ${hardwarePosition})`);
          } else {
            Alert.alert('错误', `亮灯失败: ${response.message}`);
          }
        }
      } catch (error) {
        logError('器件操作失败', error, 'DeviceListScreen.handleDeviceTagPress');
        Alert.alert('错误', `操作失败: ${formatErrorMessage(error)}`);
      }
    },
    [isConnected, litDeviceIds, devices, showSuccessMessage]
  );

  // 使用 useMemo 缓存过滤后的设备列表
  const memoizedFilteredDevices = useMemo(() => {
    if (isAdvancedSearchMode) {
      return filteredDevices;
    }
    return filterDevices(devices, searchQuery, '');
  }, [
    devices,
    searchQuery,
    isAdvancedSearchMode,
    filteredDevices,
  ]);

  // 使用 useMemo 缓存搜索建议
  const memoizedSearchSuggestions = useMemo(() => {
    return generateSearchSuggestions(searchQuery, devices, searchHistory, 5);
  }, [devices, searchHistory, searchQuery]);

  // 点亮所有灯
  const handleControlAllLightsOn = useCallback(async () => {
    if (!isConnected || !global.deviceConnection) {
      Alert.alert('提示', '请先在连接页面连接蓝牙设备');
      dispatch({ type: 'SET_CONNECTED', payload: false });
      return;
    }

    try {
      const { handler } = global.deviceConnection;
      const response = await handler.sendCommand({
        type: 'controlAll',
        state: true,
      });

      if (response.success) {
        showSuccessMessage('已点亮所有灯');
        const currentDevices = await StorageService.getDevices();
        const allDeviceIds = currentDevices.map(d => d.id);
        dispatch({ type: 'SET_LIT_DEVICE_IDS', payload: allDeviceIds });
      } else {
        Alert.alert('错误', `操作失败: ${response.message}`);
      }
    } catch (error) {
      logError(
        '控制所有灯失败',
        error,
        'DeviceListScreen.handleControlAllLightsOn'
      );
      Alert.alert('错误', '发送命令失败，请检查设备连接');
    }
  }, [isConnected, showSuccessMessage]);

  // 熄灭所有灯
  const handleControlAllLightsOff = useCallback(async () => {
    if (!isConnected || !global.deviceConnection) {
      Alert.alert('提示', '请先在连接页面连接蓝牙设备');
      dispatch({ type: 'SET_CONNECTED', payload: false });
      return;
    }

    try {
      const { handler } = global.deviceConnection;
      const response = await handler.sendCommand({
        type: 'controlAll',
        state: false,
      });

      if (response.success) {
        showSuccessMessage('已熄灭所有灯');
        dispatch({ type: 'SET_LIT_DEVICE_IDS', payload: [] });
      } else {
        Alert.alert('错误', `操作失败: ${response.message}`);
      }
    } catch (error) {
      logError(
        '控制所有灯失败',
        error,
        'DeviceListScreen.handleControlAllLightsOff'
      );
      Alert.alert('错误', '发送命令失败，请检查设备连接');
    }
  }, [isConnected, showSuccessMessage]);

  // 单个器件删除
  const handleDeleteDevice = useCallback(
    async (device) => {
      Alert.alert('确认删除', `确定要删除器件 "${device.name}" 吗？`, [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedDevices = devices.filter((d) => d.id !== device.id);
              await StorageService.saveDevices(updatedDevices);
              dispatch({ type: 'SET_DEVICES', payload: updatedDevices });
              showSuccessMessage('器件已删除');
              Alert.alert('成功', '器件已删除');
            } catch (error) {
              logError(
                '删除器件失败',
                error,
                'DeviceListScreen.handleDeleteDevice'
              );
              Alert.alert('错误', '删除器件失败');
            }
          },
        },
      ]);
    },
    [devices, dispatch, showSuccessMessage]
  );

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
              const updatedDevices = devices.filter(
                (d) => !selectedDevices.includes(d.id)
              );
              await StorageService.saveDevices(updatedDevices);
              dispatch({ type: 'SET_DEVICES', payload: updatedDevices });
              dispatch({ type: 'SET_SELECTION_MODE', payload: false });
              showSuccessMessage(`已删除 ${selectedDevices.length} 个器件`);
            } catch (error) {
              logError(
                '批量删除器件失败',
                error,
                'DeviceListScreen.handleBatchDelete'
              );
              Alert.alert('错误', '删除器件失败');
            }
          },
        },
      ]
    );
  }, [selectedDevices, devices, dispatch, showSuccessMessage]);

  // 切换选择模式
  const toggleSelectionMode = useCallback(() => {
    dispatch({ type: 'SET_SELECTION_MODE', payload: !isSelectionMode });
  }, [isSelectionMode, dispatch]);

  // 切换器件选择状态
  const toggleDeviceSelection = useCallback(
    (deviceId) => {
      dispatch({ type: 'TOGGLE_DEVICE_SELECTION', payload: deviceId });
    },
    [dispatch]
  );

  const handleAdvancedSearch = useCallback(() => {
    const filtered = devices.filter((device) => {
      let match = true;

      if (
        advancedSearchParams.category &&
        advancedSearchParams.category.trim() !== ''
      ) {
        const categoryQuery = advancedSearchParams.category.toLowerCase();
        match =
          match &&
          device.category &&
          device.category.toLowerCase().includes(categoryQuery);
      }
      if (advancedSearchParams.name) {
        match =
          match &&
          device.name &&
          device.name
            .toLowerCase()
            .includes(advancedSearchParams.name.toLowerCase());
      }
      if (advancedSearchParams.function) {
        match =
          match &&
          device.function &&
          device.function
            .toLowerCase()
            .includes(advancedSearchParams.function.toLowerCase());
      }
      if (advancedSearchParams.resistance) {
        match =
          match &&
          device.resistance &&
          device.resistance
            .toLowerCase()
            .includes(advancedSearchParams.resistance.toLowerCase());
      }
      if (advancedSearchParams.voltage) {
        match =
          match &&
          device.voltage &&
          device.voltage
            .toLowerCase()
            .includes(advancedSearchParams.voltage.toLowerCase());
      }
      if (advancedSearchParams.capacitance) {
        match =
          match &&
          device.capacitance &&
          device.capacitance
            .toLowerCase()
            .includes(advancedSearchParams.capacitance.toLowerCase());
      }
      if (advancedSearchParams.inductance) {
        match =
          match &&
          device.inductance &&
          device.inductance
            .toLowerCase()
            .includes(advancedSearchParams.inductance.toLowerCase());
      }
      if (advancedSearchParams.current) {
        match =
          match &&
          device.current &&
          device.current
            .toLowerCase()
            .includes(advancedSearchParams.current.toLowerCase());
      }
      if (advancedSearchParams.package) {
        match =
          match &&
          device.package &&
          device.package
            .toLowerCase()
            .includes(advancedSearchParams.package.toLowerCase());
      }

      return match;
    });

    dispatch({ type: 'SET_FILTERED_DEVICES', payload: filtered });
    dispatch({ type: 'SET_ADVANCED_SEARCH_MODE', payload: true });
    dispatch({ type: 'SET_SHOW_ADVANCED_SEARCH', payload: false });
  }, [devices, advancedSearchParams, dispatch]);

  const resetAdvancedSearch = useCallback(() => {
    dispatch({ type: 'RESET_ADVANCED_SEARCH' });
  }, [dispatch]);

  // 显示成功反馈
  const showSuccessMessage = useCallback(
    (message) => {
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
    },
    [dispatch, successAnimation]
  );

  const renderDeviceItem = useCallback(
    ({ item, index }) => {
      const isSelected = selectedDevices.includes(item.id);
      const isLit = litDeviceIds.includes(item.id);
      let hardwarePosition;
      if (item.location != null && item.location !== '') {
        const parsedLocation = parseInt(item.location, 10);
        hardwarePosition = isNaN(parsedLocation) ? (devices.findIndex((d) => d.id === item.id) + 1) : parsedLocation;
      } else {
        hardwarePosition = devices.findIndex((d) => d.id === item.id) + 1;
      }

      const handlePress = () => {
        if (isSelectionMode) {
          toggleDeviceSelection(item.id);
        } else {
          handleDeviceTagPress(item, hardwarePosition);
        }
      };

      const handleEdit = () => {
        navigation.navigate('AdminEdit', {
          device: item,
          isNew: false,
          onSave: loadDevices,
        });
      };

      return (
        <TouchableOpacity
          style={[
            styles.deviceTag,
            isSelected && styles.selectedDeviceTag,
            isLit && styles.litDeviceTag,
          ]}
          onPress={handlePress}
        >
          <TouchableOpacity style={styles.editIcon} onPress={handleEdit}>
            <MaterialIcons name="edit" size={18} color="#999" />
          </TouchableOpacity>
          <View style={styles.deviceTagContent}>
            <Text style={styles.deviceTagName}>{item.name || '未命名'}</Text>
            <Text style={styles.deviceTagPackage}>
              {item.package || 'N/A'}
            </Text>
          </View>
          <Text style={styles.deviceTagId}>
            {item.supplierId || ''}
          </Text>
          <Text style={styles.deviceTagLocation}>
            位置 {hardwarePosition}
          </Text>
        </TouchableOpacity>
      );
    },
    [
      selectedDevices,
      isSelectionMode,
      litDeviceIds,
      toggleDeviceSelection,
      handleDeviceTagPress,
      navigation,
      loadDevices,
      devices,
    ]
  );

  // 上架器件功能
  const handleAddDevice = useCallback(() => {
    navigation.navigate('AdminEdit', {
      device: {},
      isNew: true,
      onSave: loadDevices,
    });
  }, [navigation, loadDevices]);

  return (
    <View style={styles.container}>
      {/* 标题和蓝牙连接状态 */}
      <View style={styles.shelfSelectorContainer}>
        <Text style={styles.shelfSelectorText}>全部器件</Text>

        {/* 蓝牙连接状态指示器 */}
        <View style={styles.connectionStatusContainer}>
          {isConnected ? (
            <View style={[styles.statusIndicator, styles.connectedIndicator]}>
              <Text style={styles.statusIcon}>🔵</Text>
              <Text style={styles.statusText}>已连接</Text>
            </View>
          ) : (
            <View
              style={[styles.statusIndicator, styles.disconnectedIndicator]}
            >
              <Text style={styles.statusIcon}>⚪</Text>
              <Text style={styles.statusText}>未连接</Text>
            </View>
          )}
        </View>
      </View>

      {/* 搜索容器 */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <TextInput
            style={styles.searchInput}
            placeholder="搜索器件名称或编号..."
            value={searchQuery}
            onChangeText={(text) =>
              dispatch({ type: 'SET_SEARCH_QUERY', payload: text })
            }
            onFocus={() =>
              dispatch({ type: 'SET_SHOW_SEARCH_HISTORY', payload: true })
            }
          />
          {/* 清除搜索按钮 */}
          {(searchQuery || isAdvancedSearchMode) && (
            <TouchableOpacity
              style={styles.clearSearchButton}
              onPress={() => {
                dispatch({ type: 'SET_SEARCH_QUERY', payload: '' });
                dispatch({ type: 'RESET_ADVANCED_SEARCH' });
              }}
            >
              <Text style={styles.clearSearchButtonText}>清除</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.advancedSearchButton}
            onPress={() => {
              resetAdvancedSearch();
              dispatch({ type: 'SET_SHOW_ADVANCED_SEARCH', payload: true });
            }}
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
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={toggleSelectionMode}
              >
                <Text style={styles.cancelButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.selectAllButton}
                onPress={() => {
                  const allIds = filteredDevices.map(d => d.id);
                  const allSelected = allIds.length > 0 && allIds.every(id => selectedDevices.includes(id));
                  dispatch({ type: 'SET_SELECTED_DEVICES', payload: allSelected ? [] : allIds });
                }}
              >
                <Text style={styles.selectAllButtonText}>
                  {filteredDevices.length > 0 && filteredDevices.every(d => selectedDevices.includes(d.id)) ? '取消全选' : '全选'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.deleteButton,
                  selectedDevices.length === 0 && styles.disabledButton,
                ]}
                onPress={handleBatchDelete}
                disabled={selectedDevices.length === 0}
              >
                <Text style={styles.deleteButtonText}>
                  删除 ({selectedDevices.length})
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleAddDevice}
              >
                <Text style={styles.addButtonText}>上架器件</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={toggleSelectionMode}
              >
                <Text style={styles.selectButtonText}>批量选择</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* 控制所有灯按钮 */}
      <View style={styles.controlAllButtonsContainer}>
        <TouchableOpacity
          style={[styles.controlAllButton, styles.controlAllOnButton]}
          onPress={handleControlAllLightsOn}
        >
          <Text style={styles.controlAllButtonText}>点亮所有灯</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.controlAllButton, styles.controlAllOffButton]}
          onPress={handleControlAllLightsOff}
        >
          <Text style={styles.controlAllButtonText}>熄灭所有灯</Text>
        </TouchableOpacity>
      </View>

      {/* 设备标签列表 */}
      <ScrollView
        style={styles.tagsContainer}
        showsVerticalScrollIndicator={true}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1976d2" />
            <Text style={styles.loadingText}>加载器件数据中...</Text>
          </View>
        ) : memoizedFilteredDevices.length > 0 ? (
          <View style={styles.tagsGrid}>
            {memoizedFilteredDevices.map((item, index) => (
              <View key={item.id} style={styles.tagWrapper}>
                {renderDeviceItem({ item, index })}
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
                : '请点击右上角按钮添加或导入器件'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* 高级搜索模态框 */}
      <Modal
        visible={showAdvancedSearch}
        animationType="slide"
        transparent={true}
        onRequestClose={() =>
          dispatch({ type: 'SET_SHOW_ADVANCED_SEARCH', payload: false })
        }
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>高级搜索</Text>

            <ScrollView style={styles.advancedSearchScroll}>
              <View style={styles.advancedSearchInputContainer}>
                <Text style={styles.advancedSearchLabel}>器件分类</Text>
                <TextInput
                  style={styles.advancedSearchInput}
                  value={advancedSearchParams.category}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_ADVANCED_SEARCH_PARAMS',
                      payload: { ...advancedSearchParams, category: text },
                    })
                  }
                  placeholder="输入器件分类（如：电阻器、传感器）"
                />
              </View>

              <View style={styles.advancedSearchInputContainer}>
                <Text style={styles.advancedSearchLabel}>器件名称</Text>
                <TextInput
                  style={styles.advancedSearchInput}
                  value={advancedSearchParams.name}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_ADVANCED_SEARCH_PARAMS',
                      payload: { ...advancedSearchParams, name: text },
                    })
                  }
                  placeholder="输入器件名称"
                />
              </View>

              <View style={styles.advancedSearchInputContainer}>
                <Text style={styles.advancedSearchLabel}>功能描述</Text>
                <TextInput
                  style={styles.advancedSearchInput}
                  value={advancedSearchParams.function}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_ADVANCED_SEARCH_PARAMS',
                      payload: { ...advancedSearchParams, function: text },
                    })
                  }
                  placeholder="输入功能描述"
                />
              </View>

              <View style={styles.advancedSearchInputContainer}>
                <Text style={styles.advancedSearchLabel}>电阻</Text>
                <TextInput
                  style={styles.advancedSearchInput}
                  value={advancedSearchParams.resistance}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_ADVANCED_SEARCH_PARAMS',
                      payload: { ...advancedSearchParams, resistance: text },
                    })
                  }
                  placeholder="输入电阻值"
                />
              </View>

              <View style={styles.advancedSearchInputContainer}>
                <Text style={styles.advancedSearchLabel}>电压</Text>
                <TextInput
                  style={styles.advancedSearchInput}
                  value={advancedSearchParams.voltage}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_ADVANCED_SEARCH_PARAMS',
                      payload: { ...advancedSearchParams, voltage: text },
                    })
                  }
                  placeholder="输入电压值"
                />
              </View>

              <View style={styles.advancedSearchInputContainer}>
                <Text style={styles.advancedSearchLabel}>电容</Text>
                <TextInput
                  style={styles.advancedSearchInput}
                  value={advancedSearchParams.capacitance}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_ADVANCED_SEARCH_PARAMS',
                      payload: { ...advancedSearchParams, capacitance: text },
                    })
                  }
                  placeholder="输入电容值"
                />
              </View>

              <View style={styles.advancedSearchInputContainer}>
                <Text style={styles.advancedSearchLabel}>电感</Text>
                <TextInput
                  style={styles.advancedSearchInput}
                  value={advancedSearchParams.inductance}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_ADVANCED_SEARCH_PARAMS',
                      payload: { ...advancedSearchParams, inductance: text },
                    })
                  }
                  placeholder="输入电感值"
                />
              </View>

              <View style={styles.advancedSearchInputContainer}>
                <Text style={styles.advancedSearchLabel}>电流</Text>
                <TextInput
                  style={styles.advancedSearchInput}
                  value={advancedSearchParams.current}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_ADVANCED_SEARCH_PARAMS',
                      payload: { ...advancedSearchParams, current: text },
                    })
                  }
                  placeholder="输入电流值"
                />
              </View>

              <View style={styles.advancedSearchInputContainer}>
                <Text style={styles.advancedSearchLabel}>封装</Text>
                <TextInput
                  style={styles.advancedSearchInput}
                  value={advancedSearchParams.package}
                  onChangeText={(text) =>
                    dispatch({
                      type: 'SET_ADVANCED_SEARCH_PARAMS',
                      payload: { ...advancedSearchParams, package: text },
                    })
                  }
                  placeholder="输入封装类型（如：0805、0603）"
                />
              </View>
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  resetAdvancedSearch();
                  dispatch({
                    type: 'SET_ADVANCED_SEARCH_MODE',
                    payload: false,
                  });
                  dispatch({ type: 'SET_FILTERED_DEVICES', payload: devices });
                  dispatch({
                    type: 'SET_SHOW_ADVANCED_SEARCH',
                    payload: false,
                  });
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
    fontWeight: '700',
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
  clearSearchButton: {
    backgroundColor: '#1976d2',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  clearSearchButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
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
    marginRight: 4,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  selectAllButton: {
    backgroundColor: '#1976d2',
    flex: 1,
    marginHorizontal: 4,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  selectAllButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    flex: 1,
    marginLeft: 4,
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
  litDeviceTag: {
    backgroundColor: '#e8f5e9',
    borderWidth: 2,
    borderColor: '#81c784',
  },
  editIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    padding: 4,
  },
  deviceTagContent: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceTagId: {
    position: 'absolute',
    top: 8,
    left: 12,
    fontSize: 13,
    fontWeight: '600',
    color: '#1976d2',
  },
  deviceTagName: {
    fontSize: 21,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
  },
  deviceTagLocation: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    fontSize: 12,
    fontWeight: '600',
    color: '#64b5f6',
  },
  deviceTagPackage: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
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
  // 控制所有灯按钮样式
  controlAllButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  controlAllButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  controlAllOnButton: {
    backgroundColor: '#4caf50',
  },
  controlAllOffButton: {
    backgroundColor: '#f44336',
  },
  controlAllButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default DeviceListScreen;
