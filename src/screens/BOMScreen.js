/**
 * BOM配单屏幕
 * 用于创建、编辑和管理BOM（Bill of Materials）配单
 * 支持从器件库选择组件，保存和加载BOM配单
 */
import React, { useState, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import StorageService from '../services/StorageService';
import { logError, formatErrorMessage } from '../utils/ErrorHandler';

const BOMScreen = ({ navigation, isAdmin = false }) => {
  console.log('BOMScreen received isAdmin:', isAdmin);
  const isAdminUser = Boolean(isAdmin);
  const [components, setComponents] = useState([]);
  const [devices, setDevices] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredComponents, setFilteredComponents] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [litDeviceIds, setLitDeviceIds] = useState([]);
  const [showPositionPicker, setShowPositionPicker] = useState(false);
  const [pendingComponent, setPendingComponent] = useState(null);
  const currentLitPosition = useRef(null);

  const sendLightCommand = async (type, position) => {
    if (!global.deviceConnection || !global.deviceConnection.handler) return;
    try {
      await global.deviceConnection.handler.sendCommand({ type, lightId: position });
    } catch (error) {
      console.log('灯光指令发送失败:', error);
    }
  };

  const turnOffCurrentLight = async () => {
    if (currentLitPosition.current !== null) {
      await sendLightCommand('lightOff', currentLitPosition.current);
      currentLitPosition.current = null;
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadDevices();
      return () => {
        turnOffCurrentLight();
      };
    }, [])
  );

  useEffect(() => {
    if (!searchQuery || searchQuery.trim() === '') {
      setFilteredComponents(components);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = components.filter(
        (component) =>
          component.name && component.name.toLowerCase().includes(query)
      );
      setFilteredComponents(filtered);
    }
  }, [components, searchQuery]);

  const loadDevices = async () => {
    try {
      let savedDevices = await StorageService.getDevices();
      setDevices(savedDevices);
    } catch (error) {
      logError('加载器件失败', error, 'BOMScreen.loadDevices');
    }
  };

  const buildColumnMapping = (headerRow) => {
    const mapping = {
      sortOrder: -1,
      deviceName: -1,
      value: -1,
      supplierId: -1,
      package: -1,
      position: -1,
      description: -1,
      category: -1,
    };

    const sortOrderKeywords = ['序号', 'no', 'index', '#'];
    const deviceNameKeywords = ['name', '器件名称', '名称', '器件', 'component', 'part', '型号'];
    const valueKeywords = ['值', 'value', '数值', '规格', '参数', '参数值'];
    const supplierIdKeywords = ['supplier', '供应商', '编号', '料号', 'partno', 'pn', '供应商编号', 'vendor'];
    const packageKeywords = ['封装', 'package', '封装形式', 'footprint'];
    const positionKeywords = ['位号', 'position', 'pos', '位'];
    const descriptionKeywords = ['备注', '描述', 'description', 'desc', '说明'];
    const categoryKeywords = ['类别', '分类', 'category', 'type', '种类'];

    for (let i = 0; i < headerRow.length; i++) {
      const header = String(headerRow[i]).toLowerCase().trim();
      
      if (mapping.sortOrder === -1 && sortOrderKeywords.some(k => header === k.toLowerCase())) {
        mapping.sortOrder = i;
      } else if (mapping.deviceName === -1 && deviceNameKeywords.some(k => header.includes(k.toLowerCase()))) {
        mapping.deviceName = i;
      } else if (mapping.value === -1 && valueKeywords.some(k => header.includes(k.toLowerCase()))) {
        mapping.value = i;
      } else if (mapping.supplierId === -1 && supplierIdKeywords.some(k => header.includes(k.toLowerCase()))) {
        mapping.supplierId = i;
      } else if (mapping.package === -1 && packageKeywords.some(k => header.includes(k.toLowerCase()))) {
        mapping.package = i;
      } else if (mapping.position === -1 && positionKeywords.some(k => header.includes(k.toLowerCase()))) {
        mapping.position = i;
      } else if (mapping.description === -1 && descriptionKeywords.some(k => header.includes(k.toLowerCase()))) {
        mapping.description = i;
      } else if (mapping.category === -1 && categoryKeywords.some(k => header.includes(k.toLowerCase()))) {
        mapping.category = i;
      }
    }

    return mapping;
  };

  const handleImportBOM = async () => {
    try {
      setIsImporting(true);

      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setIsImporting(false);
        return;
      }

      const fileUri = result.assets[0].uri;
      const fileName = result.assets[0].name;

      await loadDevices();

      try {
        const cacheDir = FileSystem.cacheDirectory;
        const localUri = cacheDir + fileName;

        await FileSystem.copyAsync({
          from: fileUri,
          to: localUri,
        });

        const fileContent = await FileSystem.readAsStringAsync(localUri, {
          encoding: 'base64',
        });

        const binaryString = atob(fileContent);
        const workbook = XLSX.read(binaryString, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const csvContent = XLSX.utils.sheet_to_csv(worksheet);
        parseBOMData(csvContent, 'csv');
      } catch (error) {
        logError('处理Excel文件失败', error, 'BOMScreen.handleImportBOM');
        Alert.alert(
          '错误',
          `处理Excel文件失败: ${error.message || '请检查文件格式'}`
        );
      }
    } catch (error) {
      logError('导入BOM失败', error, 'BOMScreen.handleImportBOM');
      Alert.alert('错误', `导入BOM失败: ${error.message || '请重试'}`);
    } finally {
      setIsImporting(false);
    }
  };

  const parseValueToElectricalParams = (value) => {
    const empty = { type: '', resistance: '', voltage: '', capacitance: '', inductance: '', current: '', power: '', frequency: '' };
    if (!value) return empty;
    const v = value.trim();
    if (/^\d+\.?\d*\s*[kKMmμuGg]?\s*[ΩΩRr]$/i.test(v) || /^\d+\.?\d*\s*[kKMmμuGg]?\s*ohm$/i.test(v)) {
      return { ...empty, type: '电阻', resistance: v };
    }
    if (/^\d+\.?\d*\s*[kKMmGgT]?\s*[Hh]z$/i.test(v)) {
      return { ...empty, type: '频率', frequency: v };
    }
    if (/^\d+\.?\d*\s*[pPnNμuUmM]?\s*[Ff]$/i.test(v)) {
      return { ...empty, type: '电容', capacitance: v };
    }
    if (/^\d+\.?\d*\s*[nNμuUmM]?\s*[Hh]$/i.test(v)) {
      return { ...empty, type: '电感', inductance: v };
    }
    if (/^\d+\.?\d*\s*[mMkK]?\s*[Vv]$/i.test(v)) {
      return { ...empty, type: '电压', voltage: v };
    }
    if (/^\d+\.?\d*\s*[nNμuUmMkK]?\s*[Aa]$/i.test(v)) {
      return { ...empty, type: '电流', current: v };
    }
    if (/^\d+\.?\d*\s*[mMkK]?\s*[Ww]$/i.test(v)) {
      return { ...empty, type: '功率', power: v };
    }
    return empty;
  };

  const parseBOMData = async (csvContent, type) => {
    try {
      const workbook = XLSX.read(csvContent, { type: 'string' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (!jsonData || jsonData.length < 2) {
        Alert.alert('错误', '表格数据为空或格式不正确');
        return;
      }

      const headerRow = jsonData[0];
      const columnMapping = buildColumnMapping(headerRow);
      console.log('列映射结果:', columnMapping);

      const bomComponents = [];

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        const packageType = row[columnMapping.package] ? String(row[columnMapping.package]).trim() : '';
        const bomPosition = row[columnMapping.position] ? String(row[columnMapping.position]).trim() : '';
        const supplierId = row[columnMapping.supplierId] ? String(row[columnMapping.supplierId]).trim() : '';
        const description = row[columnMapping.description] ? String(row[columnMapping.description]).trim() : '';
        const deviceName = row[columnMapping.deviceName] ? String(row[columnMapping.deviceName]).trim() : '';
        const category = row[columnMapping.category] ? String(row[columnMapping.category]).trim() : '';
        const value = row[columnMapping.value] ? String(row[columnMapping.value]).trim() : '';
        const sortOrder = columnMapping.sortOrder !== -1 && row[columnMapping.sortOrder] ? Number(row[columnMapping.sortOrder]) : 0;

        const electricalParams = parseValueToElectricalParams(value);
        const finalCategory = category || electricalParams.type;

        let componentName = '';
        if (deviceName) {
          componentName += deviceName;
          if (packageType) componentName += ' ' + packageType;
          if (description && !componentName.includes(description)) componentName += ' (' + description + ')';
        }

        if (componentName || supplierId) {
          bomComponents.push({
            name: componentName.trim() || '',
            supplierId: supplierId,
            package: packageType,
            position: bomPosition,
            description: description,
            deviceName: deviceName,
            category: finalCategory,
            value: value,
            sortOrder: sortOrder,
            resistance: electricalParams.resistance,
            voltage: electricalParams.voltage,
            capacitance: electricalParams.capacitance,
            inductance: electricalParams.inductance,
            current: electricalParams.current,
            power: electricalParams.power,
            frequency: electricalParams.frequency,
          });
        }
      }

      if (bomComponents.length > 0) {
        const sortedComponents = bomComponents.sort((a, b) => {
          if (a.sortOrder && b.sortOrder) {
            return a.sortOrder - b.sortOrder;
          } else if (a.sortOrder) {
            return -1;
          } else if (b.sortOrder) {
            return 1;
          } else if (a.supplierId && b.supplierId) {
            return a.supplierId.localeCompare(b.supplierId);
          } else if (a.supplierId) {
            return -1;
          } else if (b.supplierId) {
            return 1;
          } else {
            return a.name.localeCompare(b.name);
          }
        });
        setComponents(sortedComponents);

        let matchedDeviceCount = 0;
        for (const component of sortedComponents) {
          const matchInfo = getDeviceMatchInfo(component);
          if (matchInfo.devices && matchInfo.devices.length > 0) {
            matchedDeviceCount += matchInfo.devices.length;
          }
        }

      } else {
        Alert.alert('错误', '未找到有效的器件数据');
      }
    } catch (error) {
      logError('解析BOM数据失败', error, 'BOMScreen.parseBOMData');
      Alert.alert('错误', '解析BOM数据失败，请检查文件格式');
    }
  };

  const getDeviceMatchInfo = (component) => {
    console.log(`\n=== getDeviceMatchInfo 开始 ===`);
    console.log(`组件名称: ${component.name}`);
    console.log(`组件供应商编号: ${component.supplierId}`);
    console.log(`组件器件名称: ${component.deviceName}`);
    console.log(`组件封装: ${component.package}`);

    const checkPackageMatch = (devicePackage, componentPackage) => {
      if (!componentPackage || !devicePackage) return true;
      const normalizedDevicePackage = devicePackage.replace(/^0+/, '');
      const normalizedComponentPackage = componentPackage.replace(/^0+/, '');
      return (
        normalizedDevicePackage === normalizedComponentPackage ||
        devicePackage === componentPackage
      );
    };

    const matchedDevices = devices.filter((device, index) => {
      console.log(`\n检查器件[${index}]: ${device.name}`);
      console.log(`  器件供应商编号: ${device.supplierId}`);
      console.log(`  器件封装: ${device.package}`);

      if (
        component.supplierId &&
        device.supplierId &&
        component.deviceName &&
        device.name
      ) {
        const supplierMatch = device.supplierId === component.supplierId;
        const nameMatch = device.name === component.deviceName;
        console.log(
          `  供应商编号匹配: ${supplierMatch}, 器件名称匹配: ${nameMatch}`
        );
        if (supplierMatch && nameMatch) {
          const packageMatch = checkPackageMatch(
            device.package,
            component.package
          );
          console.log(`  封装匹配: ${packageMatch}`);
          if (packageMatch) return true;
        }
      }

      if (component.supplierId && device.supplierId && !component.deviceName) {
        if (device.supplierId === component.supplierId) {
          const packageMatch = checkPackageMatch(
            device.package,
            component.package
          );
          console.log(`  仅供应商编号匹配: true, 封装匹配: ${packageMatch}`);
          if (packageMatch) return true;
        }
      }

      if (component.deviceName && device.name && !component.supplierId) {
        if (device.name === component.deviceName) {
          const packageMatch = checkPackageMatch(
            device.package,
            component.package
          );
          console.log(`  仅器件名称匹配: true, 封装匹配: ${packageMatch}`);
          if (packageMatch) return true;
        }
      }

      return false;
    });

    if (matchedDevices.length > 0) {
      return {
        exists: true,
        devices: matchedDevices,
        matchedCount: matchedDevices.length,
      };
    }

    return {
      exists: false,
      devices: [],
      matchedCount: 0,
    };
  };

  const isDeviceInShelf = (component) => {
    const matchInfo = getDeviceMatchInfo(component);
    return matchInfo.exists;
  };

  const handleComponentPress = async (component, device = null) => {
    if (!global.deviceConnection) {
      Alert.alert('提示', '请先在连接页面连接蓝牙设备');
      return;
    }

    let targetDevice = device;
    if (!targetDevice) {
      const matchInfo = getDeviceMatchInfo(component);
      if (!matchInfo.exists) {
        return;
      }
      if (matchInfo.devices && matchInfo.devices.length > 0) {
        targetDevice = matchInfo.devices[0];
      }
    }

    if (!targetDevice) return;

    let hardwarePosition;
    if (targetDevice.location) {
      const parsedLocation = parseInt(targetDevice.location, 10);
      const index = devices.findIndex((d) => d.id === targetDevice.id);
      hardwarePosition = isNaN(parsedLocation) ? (index + 1) : parsedLocation;
    } else {
      const index = devices.findIndex((d) => d.id === targetDevice.id);
      hardwarePosition = index + 1;
    }

    try {
      const { handler } = global.deviceConnection;
      const isLit = litDeviceIds.includes(targetDevice.id);

      if (isLit) {
        const response = await handler.sendCommand({
          type: 'lightOff',
          lightId: hardwarePosition,
        });

        if (response.success) {
          setLitDeviceIds(litDeviceIds.filter((id) => id !== targetDevice.id));
        }
      } else {
        const response = await handler.sendCommand({
          type: 'lightOn',
          lightId: hardwarePosition,
        });

        if (response.success) {
          setLitDeviceIds([...litDeviceIds, targetDevice.id]);
        }
      }
    } catch (error) {
      logError('器件操作失败', error, 'BOMScreen.handleComponentPress');
    }
  };

  const getOccupiedPositions = () => {
    const occupied = new Map();
    devices
      .filter((d) => d.shelfId === '1' && d.location)
      .forEach((d) => {
        const pos = parseInt(d.location, 10);
        if (!isNaN(pos)) {
          occupied.set(pos, d.name || '未知');
        }
      });
    return occupied;
  };

  const getAllPositions = () => {
    const occupied = getOccupiedPositions();
    const positions = [];
    for (let i = 1; i <= 100; i++) {
      positions.push({
        position: i,
        isOccupied: occupied.has(i),
        deviceName: occupied.get(i) || '',
      });
    }
    return positions;
  };

  const handleShelfDevice = (component) => {
    if (!global.deviceConnection) {
      Alert.alert('提示', '上架器件需要连接蓝牙设备以亮灯提示位置，请先在连接页面连接蓝牙设备');
      return;
    }
    setPendingComponent(component);
    setShowPositionPicker(true);
  };

  const handleSelectPosition = async (position) => {
    if (!pendingComponent) return;

    try {
      const newDevice = {
        name: pendingComponent.deviceName || pendingComponent.name,
        supplierId: pendingComponent.supplierId || '',
        package: pendingComponent.package || '',
        position: pendingComponent.position || '',
        category: pendingComponent.category || '',
        function: pendingComponent.description || '',
        value: pendingComponent.value || '',
        resistance: pendingComponent.resistance || '',
        voltage: pendingComponent.voltage || '',
        capacitance: pendingComponent.capacitance || '',
        inductance: pendingComponent.inductance || '',
        current: pendingComponent.current || '',
        power: pendingComponent.power || '',
        frequency: pendingComponent.frequency || '',
        shelfId: '1',
        location: String(position),
      };

      await StorageService.addDevice(newDevice);
      const updatedDevices = await StorageService.getDevices();
      setDevices(updatedDevices);

      if (currentLitPosition.current !== null) {
        await sendLightCommand('lightOff', currentLitPosition.current);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      await sendLightCommand('lightOn', position);
      currentLitPosition.current = position;

      setShowPositionPicker(false);
      setPendingComponent(null);
    } catch (error) {
      logError('上架器件失败', error, 'BOMScreen.handleSelectPosition');
      Alert.alert('错误', `上架失败: ${error.message}`);
    }
  };

  const autoLightAllSufficientDevices = async (
    importedComponents = components
  ) => {
    console.log('=== autoLightAllSufficientDevices 开始 ===');

    if (!global.deviceConnection) {
      console.log('❌ 未连接蓝牙设备，跳过自动点亮');
      Alert.alert('提示', '请先在连接页面连接蓝牙设备');
      return;
    }

    console.log('✅ 蓝牙设备已连接');
    console.log(`📦 导入的组件数量: ${importedComponents.length}`);
    console.log(`📦 器件架中的器件数量: ${devices.length}`);

    console.log('=== 器件架中的所有器件 ===');
    devices.forEach((d, index) => {
      console.log(
        `索引: ${index}, ID: ${d.id}, 名称: ${d.name}, 供应商编号: ${d.supplierId}, 位置: ${d.position}`
      );
    });

    const devicesToLight = [];

    for (const component of importedComponents) {
      const matchInfo = getDeviceMatchInfo(component);
      if (matchInfo.devices && matchInfo.devices.length > 0) {
        matchInfo.devices.forEach((device) => {
          const alreadyExists = devicesToLight.some((d) => d.id === device.id);
          if (!alreadyExists) {
            devicesToLight.push({ device, component });
            console.log(`添加待点亮器件: ${device.name}, ID: ${device.id}`);
          }
        });
      }
    }

    console.log(`⭐ 待点亮的器件数量: ${devicesToLight.length}`);

    if (devicesToLight.length === 0) {
      console.log('❌ 没有在架的器件');
      Alert.alert('提示', '没有在架的器件可以点亮');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const { device, component } of devicesToLight) {
      console.log(`\n处理器件: ${device.name}`);
      console.log(`组件名称: ${component.name}`);
      console.log(`器件ID: ${device.id}, 位号: ${device.position}`);

      let hardwarePosition;
      if (device.location) {
        const parsedLocation = parseInt(device.location, 10);
        const index = devices.findIndex((d) => d.id === device.id);
        hardwarePosition = isNaN(parsedLocation) ? (index + 1) : parsedLocation;
      } else {
        const index = devices.findIndex((d) => d.id === device.id);
        hardwarePosition = index + 1;
      }
      console.log(`器件位置: ${device.location}, 计算的硬件位置: ${hardwarePosition}`);

      try {
        const { handler } = global.deviceConnection;
        console.log('📤 发送点亮指令...');
        const response = await handler.sendCommand({
          type: 'lightOn',
          lightId: hardwarePosition,
        });

        if (response && response.success) {
          console.log(`✅ 指令发送成功`);
          successCount++;
        } else {
          console.log(`❌ 指令发送失败: ${response?.message || '未知错误'}`);
          failCount++;
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`❌ 发送指令异常:`, error);
        failCount++;
      }
    }

    console.log(
      `=== 自动点亮完成 === 成功: ${successCount}, 失败: ${failCount}`
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BOM 配单</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.componentsList}>
          <Text style={styles.label}>器件列表</Text>
          <View style={styles.searchInputContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="搜索器件..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          {filteredComponents.length > 0 ? (
            filteredComponents.map((component, compIndex) => {
              const matchInfo = getDeviceMatchInfo(component);
              if (matchInfo.devices && matchInfo.devices.length > 0) {
                return matchInfo.devices.map((device, deviceIndex) => {
                  const isLit = litDeviceIds.includes(device.id);
                  let bgColor, textColor, statusText;
                  if (isLit) {
                    bgColor = '#e8f5e9';
                    textColor = '#2e7d32';
                    statusText = `💡 位置 ${device.location || 'N/A'}`;
                  } else {
                    bgColor = '#ffffff';
                    textColor = '#333';
                    statusText = `位置 ${device.location || 'N/A'}`;
                  }

                  return (
                    <TouchableOpacity
                      key={`${compIndex}-${deviceIndex}-${device.id}`}
                      style={[
                        styles.componentItem,
                        { backgroundColor: bgColor },
                      ]}
                      onPress={() => handleComponentPress(component, device)}
                      activeOpacity={1}
                    >
                      <View style={styles.seqCircle}>
                        <Text style={styles.seqText}>{compIndex + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.componentText, { color: textColor }]}
                        >
                          {component.name}
                        </Text>
                        {component.supplierId && (
                          <Text style={styles.supplierId}>
                            编号: {component.supplierId}
                          </Text>
                        )}
                        <Text style={styles.deviceInfo}>
                          位号: {device.position || `未设置`}
                        </Text>
                        <Text style={[styles.statusText, { color: textColor }]}>
                          {statusText}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                });
              } else {
                return (
                  <View
                    key={compIndex}
                    style={[
                      styles.componentItem,
                      { backgroundColor: '#fff3e0' },
                    ]}
                  >
                    <View style={styles.seqCircle}>
                      <Text style={styles.seqText}>{compIndex + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.componentText, { color: '#ef6c00' }]}
                      >
                        {component.name}
                      </Text>
                      {component.supplierId && (
                        <Text style={styles.supplierId}>
                          编号: {component.supplierId}
                        </Text>
                      )}
                      <Text style={[styles.statusText, { color: '#ef6c00' }]}>
                        ✗ 不在器件架中
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.shelfButton}
                      onPress={() => handleShelfDevice(component)}
                    >
                      <Text style={styles.shelfButtonText}>上架</Text>
                    </TouchableOpacity>
                  </View>
                );
              }
            })
          ) : (
            <Text style={styles.emptyText}>
              {searchQuery.trim()
                ? '未找到匹配的组件'
                : isAdminUser
                  ? '暂无组件，请添加'
                  : '暂无组件'}
            </Text>
          )}
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.importButton]}
            onPress={handleImportBOM}
            disabled={isImporting}
          >
            <Text style={styles.buttonText}>
              {isImporting ? '导入中...' : '导入 BOM 文件'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={showPositionPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPositionPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>选择物理位置</Text>
            {pendingComponent && (
              <Text style={styles.modalSubtitle}>
                {pendingComponent.deviceName || pendingComponent.name}
              </Text>
            )}
            <ScrollView style={styles.positionGrid}>
              <View style={styles.positionGridInner}>
                {getAllPositions().map((posInfo) => (
                  <TouchableOpacity
                    key={posInfo.position}
                    style={[
                      styles.positionItem,
                      posInfo.isOccupied ? styles.positionItemOccupied : styles.positionItemEmpty,
                    ]}
                    onPress={() => {
                      if (posInfo.isOccupied) return;
                      handleSelectPosition(posInfo.position);
                    }}
                    activeOpacity={posInfo.isOccupied ? 1 : 0.7}
                  >
                    <Text
                      style={[
                        styles.positionItemText,
                        posInfo.isOccupied ? styles.positionItemTextOccupied : styles.positionItemTextEmpty,
                      ]}
                    >
                      {posInfo.position}
                    </Text>
                    {posInfo.isOccupied && (
                      <Text style={styles.positionItemDeviceName} numberOfLines={1}>
                        {posInfo.deviceName}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => {
                turnOffCurrentLight();
                setShowPositionPicker(false);
                setPendingComponent(null);
              }}
            >
              <Text style={styles.modalCancelButtonText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#e0e0e0',
    padding: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  componentsList: {
    marginBottom: 20,
  },
  componentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 8,
  },
  seqCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  seqText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  componentText: {
    fontSize: 16,
    fontWeight: '500',
  },
  supplierId: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  deviceInfo: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  importButton: {
    backgroundColor: '#ff9800',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  shelfButton: {
    backgroundColor: '#1976d2',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 8,
    alignSelf: 'center',
  },
  shelfButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
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
    width: '85%',
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  positionGrid: {
    maxHeight: 350,
  },
  positionGridInner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  positionItem: {
    width: 56,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    margin: 4,
    borderWidth: 1,
  },
  positionItemEmpty: {
    backgroundColor: '#e3f2fd',
    borderColor: '#bbdefb',
  },
  positionItemOccupied: {
    backgroundColor: '#e8f5e9',
    borderColor: '#a5d6a7',
  },
  positionItemText: {
    fontSize: 16,
    fontWeight: '600',
  },
  positionItemTextEmpty: {
    color: '#1976d2',
  },
  positionItemTextOccupied: {
    color: '#2e7d32',
  },
  positionItemDeviceName: {
    fontSize: 8,
    color: '#4caf50',
    marginTop: 1,
  },
  modalCancelButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#8E8E93',
    alignItems: 'center',
  },
  modalCancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchInputContainer: {
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
  },
});

export default BOMScreen;