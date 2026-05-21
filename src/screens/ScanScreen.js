import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Modal, Alert, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import StorageService from '../services/StorageService';

const ScanScreen = ({ navigation, route }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPositionPicker, setShowPositionPicker] = useState(false);
  const [expandedBank, setExpandedBank] = useState(null);
  const [currentDeviceInfo, setCurrentDeviceInfo] = useState(null);
  const [currentEmptyPosition, setCurrentEmptyPosition] = useState(null);
  const [occupiedPositions, setOccupiedPositions] = useState(new Map());
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const scanningRef = useRef(false);
  const currentLitPosition = useRef(null);
  const soundRef = useRef(null);
  // 暂存扫码解析出的器件数据（确认后才保存）
  const pendingDeviceRef = useRef(null);

  useEffect(() => {
    const loadSound = async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          require('../../assets/scan_beep.wav')
        );
        soundRef.current = sound;
        scanningRef.current = true;
      } catch (error) {
        console.log('加载音效失败:', error);
        scanningRef.current = true;
      }
    };
    loadSound();
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const playBeep = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.replayAsync();
      }
    } catch (error) {
      console.log('播放音效失败:', error);
    }
  };

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

  const sendLightCommand = async (type, position) => {
    if (!global.deviceConnection || !global.deviceConnection.handler) return;
    try {
      await global.deviceConnection.handler.sendCommand({ type, lightId: position });
    } catch (error) {
      console.log('灯光指令发送失败:', error);
    }
  };

  useEffect(() => {
    return () => {
      if (currentLitPosition.current !== null) {
        sendLightCommand('lightOff', currentLitPosition.current);
      }
    };
  }, []);

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
    return null;
  };

  /**
   * 加载已占用的位置映射（用于位置选择器）
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
   * 获取所有位置信息（0-89，共90个位置，分3排）
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

  const handleBarCodeScanned = async ({ type, data }) => {
    if (!scanningRef.current) return;
    if (showConfirmModal) return;

    scanningRef.current = false;

    const parsed = parseQRCode(data);
    const supplierId = parsed.pc || '';
    const deviceName = parsed.pm || '';

    if (!supplierId) {
      showToast('未识别到供应商编号');
      scanningRef.current = true;
      return;
    }

    if (!global.deviceConnection) {
      Alert.alert('提示', '蓝牙未连接，无法上架器件。请先在连接页面连接蓝牙设备。');
      scanningRef.current = true;
      return;
    }

    try {
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
        const parts = valueStr.trim().split(/[/,，\s]+/).filter(p => p.trim());
        for (const part of parts) {
          const v = part.trim();
          if (/^\d+\.?\d*\s*[kKMmμuGg]?\s*[ΩΩRr]$/i.test(v) || /^\d+\.?\d*\s*[kKMmμuGg]?\s*ohm$/i.test(v)) {
            electricalParams.resistance = v;
          } else if (/^\d+\.?\d*\s*[kKMmGgT]?\s*[Hh]z$/i.test(v)) {
            electricalParams.frequency = v;
          } else if (/^\d+\.?\d*\s*[pPnNμuUmM]?\s*[Ff]$/i.test(v)) {
            electricalParams.capacitance = v;
          } else if (/^\d+\.?\d*\s*[nNμuUmM]?\s*[Hh]$/i.test(v)) {
            electricalParams.inductance = v;
          } else if (/^\d+\.?\d*\s*[mMkK]?\s*[Vv]$/i.test(v)) {
            electricalParams.voltage = v;
          } else if (/^\d+\.?\d*\s*[nNμuUmMkK]?\s*[Aa]$/i.test(v)) {
            electricalParams.current = v;
          } else if (/^\d+\.?\d*\s*[mMkK]?\s*[Ww]$/i.test(v)) {
            electricalParams.power = v;
          }
        }
      }

      // 暂存器件数据，不立即保存
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

      playBeep();

      // 点亮第一个空位置
      if (currentLitPosition.current !== null) {
        await sendLightCommand('lightOff', currentLitPosition.current);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      await sendLightCommand('lightOn', emptyPosition);
      currentLitPosition.current = emptyPosition;

      setCurrentDeviceInfo({ name: deviceName, supplierId });
      setCurrentEmptyPosition(emptyPosition);
      setShowConfirmModal(true);
    } catch (error) {
      showToast('扫码处理失败');
      scanningRef.current = true;
    }
  };

  /**
   * 确认上架到第一个空位置
   */
  const handleConfirm = async () => {
    try {
      if (pendingDeviceRef.current) {
        await StorageService.addDevice(pendingDeviceRef.current);
        pendingDeviceRef.current = null;
      }
      if (currentLitPosition.current !== null) {
        await sendLightCommand('lightOff', currentLitPosition.current);
        currentLitPosition.current = null;
      }
      setShowConfirmModal(false);
      setCurrentDeviceInfo(null);
      setCurrentEmptyPosition(null);
      showToast('上架成功');
      setTimeout(() => {
        scanningRef.current = true;
      }, 2000);
    } catch (error) {
      showToast('上架失败');
      scanningRef.current = true;
    }
  };

  /**
   * 打开位置选择器
   */
  const handleOpenPositionPicker = async () => {
    await loadOccupiedPositions();
    setShowConfirmModal(false);
    setExpandedBank(null);
    setShowPositionPicker(true);
  };

  /**
   * 从位置选择器选择位置后上架
   */
  const handleSelectPosition = async (position) => {
    try {
      if (pendingDeviceRef.current) {
        // 更新位置
        pendingDeviceRef.current.location = String(position);
        await StorageService.addDevice(pendingDeviceRef.current);
        pendingDeviceRef.current = null;
      }

      // 熄灭之前的灯光，点亮新位置
      if (currentLitPosition.current !== null) {
        await sendLightCommand('lightOff', currentLitPosition.current);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      await sendLightCommand('lightOn', position);
      currentLitPosition.current = position;

      setShowPositionPicker(false);
      setCurrentDeviceInfo(null);
      setCurrentEmptyPosition(null);
      showToast(`上架成功，位置 ${position}`);
      setTimeout(() => {
        scanningRef.current = true;
      }, 2000);
    } catch (error) {
      showToast('上架失败');
      scanningRef.current = true;
    }
  };

  /**
   * 位置选择器中点击位置格子时预览亮灯
   */
  const handlePositionPreview = async (posInfo) => {
    if (posInfo.isOccupied) return;
    if (currentLitPosition.current !== null) {
      await sendLightCommand('lightOff', currentLitPosition.current);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    await sendLightCommand('lightOn', posInfo.position);
    currentLitPosition.current = posInfo.position;
  };

  const handleCancel = () => {
    if (currentLitPosition.current !== null) {
      sendLightCommand('lightOff', currentLitPosition.current);
      currentLitPosition.current = null;
    }
    navigation.navigate('MainTabs', { screen: 'DeviceListTab' });
  };

  /**
   * 取消确认弹窗（放弃本次扫码上架）
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

  const turnOffCurrentLight = async () => {
    if (currentLitPosition.current !== null) {
      await sendLightCommand('lightOff', currentLitPosition.current);
      currentLitPosition.current = null;
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>请求相机权限...</Text>
      </View>
    );
  }

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

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'code93', 'upc_e', 'itf14'],
        }}
      />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={handleCancel}>
          <Text style={styles.backButtonText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.scanTitle}>扫码导入器件</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.scanFrame}>
        <View style={styles.frameCornerTopLeft} />
        <View style={styles.frameCornerTopRight} />
        <View style={styles.frameCornerBottomLeft} />
        <View style={styles.frameCornerBottomRight} />
        <Text style={styles.scanHint}>将二维码/条形码对准扫描框</Text>
      </View>

      {toastVisible && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}

      {/* 扫码确认弹窗 */}
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
                默认位置：{currentEmptyPosition ?? 'N/A'}
              </Text>
            </View>
            <View style={styles.confirmButtonRow}>
              <TouchableOpacity
                style={styles.cancelConfirmButton}
                onPress={handleCancelConfirm}
              >
                <Text style={styles.cancelConfirmButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.positionButton}
                onPress={handleOpenPositionPicker}
              >
                <Text style={styles.positionButtonText}>位置</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleConfirm}
              >
                <Text style={styles.confirmButtonText}>确认</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 位置选择弹窗 */}
      <Modal
        visible={showPositionPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCancelPositionPicker}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.positionModalContent}>
            <Text style={styles.modalTitle}>选择物理位置</Text>
            {pendingDeviceRef.current && (
              <Text style={styles.positionModalSubtitle}>
                {pendingDeviceRef.current.name || pendingDeviceRef.current.supplierId}
              </Text>
            )}
            <ScrollView style={styles.positionGrid}>
              {Array.from({ length: 3 }, (_, bankIndex) => (
                <View key={bankIndex}>
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
                              if (posInfo.isOccupied) return;
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
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },
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
  /* 确认弹窗按钮行：取消、位置、确认 */
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
