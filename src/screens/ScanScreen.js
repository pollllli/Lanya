import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Modal, Alert, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import StorageService from '../services/StorageService';

const ScanScreen = ({ navigation, route }) => {
  // 相机权限
  const [permission, requestPermission] = useCameraPermissions();
  // 提示消息相关状态
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  // 确认弹窗与位置选择弹窗的显示状态
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPositionPicker, setShowPositionPicker] = useState(false);
  // 当前展开的排（位置选择器中3排的展开/折叠）
  const [expandedBank, setExpandedBank] = useState(null);
  // 当前扫码识别到的器件信息（名称、供应商编号）
  const [currentDeviceInfo, setCurrentDeviceInfo] = useState(null);
  // 当前上架位置（默认为第一个空位置，用户可通过位置选择器更改）
  const [currentEmptyPosition, setCurrentEmptyPosition] = useState(null);
  // 已占用的位置映射（位置号 → 器件名称），用于位置选择器显示
  const [occupiedPositions, setOccupiedPositions] = useState(new Map());
  // 提示消息的透明度动画值
  const toastOpacity = useRef(new Animated.Value(0)).current;
  // 是否允许扫码（防止重复扫码）
  const scanningRef = useRef(false);
  // 当前亮灯的位置编号（用于熄灯操作）
  const currentLitPosition = useRef(null);
  // 扫码提示音引用
  const soundRef = useRef(null);
  // 暂存扫码解析出的器件数据（确认后才保存到数据库）
  const pendingDeviceRef = useRef(null);

  // 组件挂载时加载扫码提示音
  useEffect(() => {
    const loadSound = async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          require('../../assets/scan_beep.wav')
        );
        soundRef.current = sound;
        scanningRef.current = true; // 音效加载完成，允许扫码
      } catch (error) {
        console.log('加载音效失败:', error);
        scanningRef.current = true; // 即使音效加载失败也允许扫码
      }
    };
    loadSound();
    // 组件卸载时释放音效资源
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  // 播放扫码提示音
  const playBeep = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.replayAsync();
      }
    } catch (error) {
      console.log('播放音效失败:', error);
    }
  };

  // 显示提示消息（带淡入淡出动画，1.5秒后自动消失）
  const showToast = (message) => {
    setToastMessage(message);
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(1500),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setToastVisible(false);
    });
  };

  // 发送灯光指令（亮灯/熄灯）到蓝牙设备
  const sendLightCommand = async (type, position) => {
    if (!global.deviceConnection || !global.deviceConnection.handler) return;
    try {
      await global.deviceConnection.handler.sendCommand({ type, lightId: position });
    } catch (error) {
      console.log('灯光指令发送失败:', error);
    }
  };

  // 组件卸载时熄灭当前亮着的灯
  useEffect(() => {
    return () => {
      if (currentLitPosition.current !== null) {
        sendLightCommand('lightOff', currentLitPosition.current);
      }
    };
  }, []);

  // 查找器件架1中第一个空位置（0-89）
  const findFirstEmptyPosition = async () => {
    const devices = await StorageService.getDevices();
    const occupiedPositions = new Set();
    devices.forEach(d => {
      if (d.shelfId === '1' && d.location != null && d.location !== '') {
        const pos = parseInt(d.location, 10);
        if (!isNaN(pos)) {
          occupiedPositions.add(pos);
        }
      }
    });
    for (let i = 0; i < 90; i++) {
      if (!occupiedPositions.has(i)) {
        return i;
      }
    }
    return null; // 器件架已满
  };

  /**
   * 加载已占用的位置映射（用于位置选择器中标记已占用的格子）
   */
  const loadOccupiedPositions = async () => {
    const devices = await StorageService.getDevices();
    const occupied = new Map();
    devices
      .filter(d => d.shelfId === '1' && d.location != null && d.location !== '')
      .forEach(d => {
        const pos = parseInt(d.location, 10);
        if (!isNaN(pos)) {
          occupied.set(pos, d.name || '未知');
        }
      });
    setOccupiedPositions(occupied);
  };

  /**
   * 获取所有位置信息（0-89，共90个位置，分3排，每排30个）
   */
  const getAllPositions = () => {
    const positions = [];
    for (let i = 0; i < 90; i++) {
      positions.push({
        position: i,
        isOccupied: occupiedPositions.has(i),
        deviceName: occupiedPositions.get(i) || '',
      });
    }
    return positions;
  };

  // 解析二维码数据（格式：key1:value1,key2:value2,...）
  const parseQRCode = (data) => {
    try {
      const result = {};
      const pairs = data.split(',');
      pairs.forEach(pair => {
        const colonIndex = pair.indexOf(':');
        if (colonIndex > 0) {
          const key = pair.substring(0, colonIndex).trim();
          const value = pair.substring(colonIndex + 1).trim();
          result[key] = value;
        }
      });
      return result;
    } catch (error) {
      return {};
    }
  };

  // 扫码回调：识别到条码/二维码后触发
  const handleBarCodeScanned = async ({ type, data }) => {
    // 防止重复扫码
    if (!scanningRef.current) return;
    // 确认弹窗显示时不处理新扫码
    if (showConfirmModal) return;

    // 暂停扫码，直到本次流程结束
    scanningRef.current = false;

    // 解析二维码内容
    const parsed = parseQRCode(data);
    const supplierId = parsed.pc || '';  // 供应商编号
    const deviceName = parsed.pm || '';   // 器件名称

    // 校验：必须有供应商编号
    if (!supplierId) {
      showToast('未识别到供应商编号');
      scanningRef.current = true;
      return;
    }

    // 校验：必须连接蓝牙设备才能上架
    if (!global.deviceConnection) {
      Alert.alert('提示', '蓝牙未连接，无法上架器件。请先在连接页面连接蓝牙设备。');
      scanningRef.current = true;
      return;
    }

    try {
      // 查找第一个空位置
      const emptyPosition = await findFirstEmptyPosition();
      if (emptyPosition === null) {
        showToast('器件架已满，没有空位置');
        scanningRef.current = true;
        return;
      }

      // 从二维码中提取值字段
      const valueStr = parsed.val || parsed.value || parsed.v || '';
      // 解析电气参数（支持复合值如 "10uf/50V"）
      const electricalParams = { resistance: '', voltage: '', capacitance: '', inductance: '', current: '', power: '', frequency: '' };
      if (valueStr) {
        // 按斜杠、逗号、空格拆分复合值
        const parts = valueStr.trim().split(/[/,，\s]+/).filter(p => p.trim());
        for (const part of parts) {
          const v = part.trim();
          // 电阻（Ω/ohm）
          if (/^\d+\.?\d*\s*[kKMmμuGg]?\s*[ΩΩRr]$/i.test(v) || /^\d+\.?\d*\s*[kKMmμuGg]?\s*ohm$/i.test(v)) {
            electricalParams.resistance = v;
          // 频率（Hz）
          } else if (/^\d+\.?\d*\s*[kKMmGgT]?\s*[Hh]z$/i.test(v)) {
            electricalParams.frequency = v;
          // 电容（F）
          } else if (/^\d+\.?\d*\s*[pPnNμuUmM]?\s*[Ff]$/i.test(v)) {
            electricalParams.capacitance = v;
          // 电感（H）
          } else if (/^\d+\.?\d*\s*[nNμuUmM]?\s*[Hh]$/i.test(v)) {
            electricalParams.inductance = v;
          // 电压（V）
          } else if (/^\d+\.?\d*\s*[mMkK]?\s*[Vv]$/i.test(v)) {
            electricalParams.voltage = v;
          // 电流（A）
          } else if (/^\d+\.?\d*\s*[nNμuUmMkK]?\s*[Aa]$/i.test(v)) {
            electricalParams.current = v;
          // 功率（W）
          } else if (/^\d+\.?\d*\s*[mMkK]?\s*[Ww]$/i.test(v)) {
            electricalParams.power = v;
          }
        }
      }

      // 暂存器件数据，不立即保存（等用户确认后才写入数据库）
      const newDevice = {
        name: deviceName || '',
        supplierId: supplierId,
        package: parsed.pkg || parsed.package || '',
        position: '',
        category: '',
        notes: '',
        value: valueStr,
        resistance: electricalParams.resistance,
        voltage: electricalParams.voltage,
        capacitance: electricalParams.capacitance,
        inductance: electricalParams.inductance,
        current: electricalParams.current,
        power: electricalParams.power,
        frequency: electricalParams.frequency,
        shelfId: '1',
        location: String(emptyPosition),
      };

      pendingDeviceRef.current = newDevice;

      // 播放扫码提示音
      playBeep();

      // 点亮第一个空位置的指示灯（先熄灭之前亮着的灯）
      if (currentLitPosition.current !== null) {
        await sendLightCommand('lightOff', currentLitPosition.current);
        await new Promise(resolve => setTimeout(resolve, 300)); // 等待熄灯完成
      }
      await sendLightCommand('lightOn', emptyPosition);
      currentLitPosition.current = emptyPosition;

      // 显示确认弹窗
      setCurrentDeviceInfo({ name: deviceName, supplierId });
      setCurrentEmptyPosition(emptyPosition);
      setShowConfirmModal(true);
    } catch (error) {
      showToast('扫码处理失败');
      scanningRef.current = true;
    }
  };

  /**
   * 确认上架：将暂存的器件数据保存到数据库，熄灭指示灯
   */
  const handleConfirm = async () => {
    try {
      if (pendingDeviceRef.current) {
        await StorageService.addDevice(pendingDeviceRef.current);
        pendingDeviceRef.current = null;
      }
      // 上架成功后熄灭指示灯
      if (currentLitPosition.current !== null) {
        await sendLightCommand('lightOff', currentLitPosition.current);
        currentLitPosition.current = null;
      }
      // 关闭确认弹窗，重置状态
      setShowConfirmModal(false);
      setCurrentDeviceInfo(null);
      setCurrentEmptyPosition(null);
      showToast('上架成功');
      // 延迟2秒后恢复扫码，避免立即重复扫码
      setTimeout(() => {
        scanningRef.current = true;
      }, 2000);
    } catch (error) {
      showToast('上架失败');
      scanningRef.current = true;
    }
  };

  /**
   * 打开位置选择器：加载已占用位置，隐藏确认弹窗
   */
  const handleOpenPositionPicker = async () => {
    await loadOccupiedPositions();
    setShowConfirmModal(false);
    setExpandedBank(null);
    setShowPositionPicker(true);
  };

  /**
   * 从位置选择器选择位置后，仅更新位置变量，回到确认弹窗
   * 不会直接上架，需要用户在确认弹窗点击确认才会上架
   */
  const handleSelectPosition = async (position) => {
    try {
      // 只更新暂存器件的位置变量，不保存到数据库
      if (pendingDeviceRef.current) {
        pendingDeviceRef.current.location = String(position);
      }

      // 熄灭之前的灯光，点亮新选择的位灯
      if (currentLitPosition.current !== null) {
        await sendLightCommand('lightOff', currentLitPosition.current);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      await sendLightCommand('lightOn', position);
      currentLitPosition.current = position;

      // 回到确认弹窗，显示新选择的位置
      setCurrentEmptyPosition(position);
      setShowPositionPicker(false);
      setShowConfirmModal(true);
    } catch (error) {
      showToast('位置选择失败');
    }
  };

  /**
   * 位置选择器中长按位置格子时预览亮灯（不选择，仅亮灯预览）
   */
  const handlePositionPreview = async (posInfo) => {
    if (posInfo.isOccupied) return; // 已占用的位置不预览
    if (currentLitPosition.current !== null) {
      await sendLightCommand('lightOff', currentLitPosition.current);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    await sendLightCommand('lightOn', posInfo.position);
    currentLitPosition.current = posInfo.position;
  };

  // 返回按钮：熄灭灯光，导航回器件列表页
  const handleCancel = () => {
    if (currentLitPosition.current !== null) {
      sendLightCommand('lightOff', currentLitPosition.current);
      currentLitPosition.current = null;
    }
    navigation.navigate('MainTabs', { screen: 'DeviceListTab' });
  };

  /**
   * 取消确认弹窗：放弃本次扫码上架，熄灭灯光，恢复扫码
   */
  const handleCancelConfirm = () => {
    pendingDeviceRef.current = null;
    if (currentLitPosition.current !== null) {
      sendLightCommand('lightOff', currentLitPosition.current);
      currentLitPosition.current = null;
    }
    setShowConfirmModal(false);
    setCurrentDeviceInfo(null);
    setCurrentEmptyPosition(null);
    scanningRef.current = true;
  };

  /**
   * 关闭位置选择器，回到确认弹窗（保持灯光不熄灭）
   */
  const handleCancelPositionPicker = () => {
    setShowPositionPicker(false);
    setShowConfirmModal(true);
  };

  // 熄灭当前亮着的灯
  const turnOffCurrentLight = async () => {
    if (currentLitPosition.current !== null) {
      await sendLightCommand('lightOff', currentLitPosition.current);
      currentLitPosition.current = null;
    }
  };

  // 正在请求相机权限
  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>请求相机权限...</Text>
      </View>
    );
  }

  // 相机权限未授予，显示授权引导页
  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>需要相机权限才能扫码</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>授权</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelPermissionButton} onPress={handleCancel}>
          <Text style={styles.cancelPermissionButtonText}>取消</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 主界面：相机预览 + 扫码框 + 弹窗
  return (
    <View style={styles.container}>
      {/* 相机预览（全屏铺底） */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'code93', 'upc_e', 'itf14'],
        }}
      />

      {/* 顶部导航栏 */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={handleCancel}>
          <Text style={styles.backButtonText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.scanTitle}>扫码导入器件</Text>
        <View style={styles.placeholder} />
      </View>

      {/* 扫码框（四角绿色边框 + 提示文字） */}
      <View style={styles.scanFrame}>
        <View style={styles.frameCornerTopLeft} />
        <View style={styles.frameCornerTopRight} />
        <View style={styles.frameCornerBottomLeft} />
        <View style={styles.frameCornerBottomRight} />
        <Text style={styles.scanHint}>将二维码/条形码对准扫描框</Text>
      </View>

      {/* 提示消息（带淡入淡出动画） */}
      {toastVisible && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}

      {/* 扫码确认弹窗：显示器件信息，提供确认/位置/取消按钮 */}
      <Modal
        visible={showConfirmModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>扫码识别成功</Text>
            <View style={styles.modalBody}>
              <Text style={styles.modalText}>
                器件名称：{currentDeviceInfo?.name || '未命名'}
              </Text>
              <Text style={styles.modalText}>
                供应商编号：{currentDeviceInfo?.supplierId || 'N/A'}
              </Text>
              <Text style={styles.modalText}>
                上架位置：{currentEmptyPosition ?? 'N/A'}
              </Text>
            </View>
            {/* 按钮行：确认（左）、位置（中）、取消（右） */}
            <View style={styles.confirmButtonRow}>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleConfirm}
              >
                <Text style={styles.confirmButtonText}>确认</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.positionButton}
                onPress={handleOpenPositionPicker}
              >
                <Text style={styles.positionButtonText}>位置</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelConfirmButton}
                onPress={handleCancelConfirm}
              >
                <Text style={styles.cancelConfirmButtonText}>取消</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 位置选择弹窗：3排×30个位置，点击选择，长按预览亮灯 */}
      <Modal
        visible={showPositionPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCancelPositionPicker}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.positionModalContent}>
            <Text style={styles.modalTitle}>选择物理位置</Text>
            {/* 显示当前待上架的器件名称 */}
            {pendingDeviceRef.current && (
              <Text style={styles.positionModalSubtitle}>
                {pendingDeviceRef.current.name || pendingDeviceRef.current.supplierId}
              </Text>
            )}
            {/* 位置网格：3排，每排可展开/折叠 */}
            <ScrollView style={styles.positionGrid}>
              {Array.from({ length: 3 }, (_, bankIndex) => (
                <View key={bankIndex}>
                  {/* 排标题（点击展开/折叠） */}
                  <TouchableOpacity
                    style={styles.positionBankHeader}
                    onPress={() => setExpandedBank(expandedBank === bankIndex ? null : bankIndex)}
                  >
                    <Text style={styles.positionBankHeaderText}>
                      第{bankIndex + 1}排（位置 {bankIndex * 30}-{bankIndex * 30 + 29}）
                    </Text>
                    <Text style={styles.positionBankHeaderArrow}>
                      {expandedBank === bankIndex ? '▲' : '▼'}
                    </Text>
                  </TouchableOpacity>
                  {/* 展开后显示该排的位置格子 */}
                  {expandedBank === bankIndex && (
                    <View style={styles.positionGridInner}>
                      {getAllPositions()
                        .slice(bankIndex * 30, (bankIndex + 1) * 30)
                        .map((posInfo) => (
                          <TouchableOpacity
                            key={posInfo.position}
                            style={[
                              styles.positionItem,
                              posInfo.isOccupied ? styles.positionItemOccupied : styles.positionItemEmpty,
                            ]}
                            onPress={() => {
                              if (posInfo.isOccupied) return; // 已占用的位置不可选择
                              handleSelectPosition(posInfo.position);
                            }}
                            onLongPress={() => handlePositionPreview(posInfo)}
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
                            {/* 已占用的位置显示器件名称 */}
                            {posInfo.isOccupied && (
                              <Text style={styles.positionItemDeviceName} numberOfLines={1}>
                                {posInfo.deviceName}
                              </Text>
                            )}
                          </TouchableOpacity>
                        ))}
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
            {/* 取消按钮：关闭位置选择器，回到确认弹窗 */}
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={handleCancelPositionPicker}
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
  /* ===== 基础布局 ===== */
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },

  /* ===== 相机权限引导页 ===== */
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  permissionText: {
    fontSize: 18,
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    marginBottom: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelPermissionButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  cancelPermissionButtonText: {
    color: '#999',
    fontSize: 16,
  },

  /* ===== 顶部导航栏 ===== */
  topBar: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 100,
  },
  backButton: {
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  scanTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 60,
  },

  /* ===== 扫码框（四角绿色边框） ===== */
  scanFrame: {
    position: 'absolute',
    top: '30%',
    left: '15%',
    right: '15%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  frameCornerTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 30,
    height: 30,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#00ff00',
  },
  frameCornerTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 30,
    height: 30,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: '#00ff00',
  },
  frameCornerBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 30,
    height: 30,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#00ff00',
  },
  frameCornerBottomRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: '#00ff00',
  },
  scanHint: {
    position: 'absolute',
    bottom: -40,
    color: '#fff',
    fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 8,
    borderRadius: 8,
  },

  /* ===== 提示消息 ===== */
  toast: {
    position: 'absolute',
    bottom: 120,
    left: '10%',
    right: '10%',
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    zIndex: 200,
  },
  toastText: {
    color: '#4caf50',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },

  /* ===== 弹窗通用样式 ===== */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 300,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    width: '80%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  modalBody: {
    width: '100%',
    marginBottom: 20,
  },
  modalText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },

  /* ===== 确认弹窗按钮行：确认（左）、位置（中）、取消（右） ===== */
  confirmButtonRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  cancelConfirmButton: {
    flex: 1,
    backgroundColor: '#8E8E93',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelConfirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  positionButton: {
    flex: 1,
    backgroundColor: '#1976d2',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  positionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#4caf50',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },

  /* ===== 位置选择弹窗样式 ===== */
  positionModalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '85%',
    maxHeight: '70%',
  },
  positionModalSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  positionGrid: {
    maxHeight: 350,
  },
  positionBankHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 6,
    marginTop: 4,
  },
  positionBankHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  positionBankHeaderArrow: {
    fontSize: 12,
    color: '#666',
  },
  positionGridInner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  positionItem: {
    width: '18%',
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    marginHorizontal: '1%',
    marginBottom: 6,
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
});

export default ScanScreen;
