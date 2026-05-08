import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import StorageService from '../services/StorageService';
import { logError, formatErrorMessage } from '../utils/ErrorHandler';

const ProfileScreen = ({ navigation, route }) => {
  const [userInfo, setUserInfo] = useState({
    username: 'user',
    role: '普通用户'
  });
  
  // 修改密码相关状态
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // 密码可见性控制
  const [currentPasswordVisible, setCurrentPasswordVisible] = useState(false);
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  
  // 错误信息
  const [error, setError] = useState('');

  useEffect(() => {
    // 从路由参数中获取用户信息
    console.log('ProfileScreen route.params:', route.params);
    if (route.params) {
      const { username, isAdmin } = route.params;
      console.log('ProfileScreen received:', { username, isAdmin });
      setUserInfo({
        username: username || 'user',
        role: isAdmin ? '管理员' : '普通用户'
      });
    } else {
      // 尝试从 navigation.getState() 中获取
      const state = navigation.getState();
      console.log('ProfileScreen navigation state:', state);
      if (state.routes[0].params) {
        const { username, isAdmin } = state.routes[0].params;
        console.log('ProfileScreen from navigation state:', { username, isAdmin });
        setUserInfo({
          username: username || (isAdmin ? 'admin' : 'user'),
          role: isAdmin ? '管理员' : '普通用户'
        });
      } else {
        // 直接从存储中获取登录用户信息
        const getLoggedInUserInfo = async () => {
          try {
            const user = await StorageService.getLoggedInUser();
            if (user) {
              console.log('ProfileScreen from storage:', user);
              setUserInfo({
                username: user.username || 'user',
                role: user.isAdmin ? '管理员' : '普通用户'
              });
            }
          } catch (error) {
            logError('获取登录用户信息失败', error, 'ProfileScreen.getLoggedInUserInfo');
          }
        };
        getLoggedInUserInfo();
      }
    }
  }, [route.params, navigation]);

  const handleLogout = async () => {
    Alert.alert(
      '确认退出',
      '确定要退出登录吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            // 清除登录状态
            await StorageService.removeLoggedInUser();
            // 导航到登录页面
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          }
        }
      ]
    );
  };

  const handleChangePassword = () => {
    // 打开修改密码模态框
    setShowChangePasswordModal(true);
  };

  // 处理密码修改
  const handlePasswordSubmit = async () => {
    // 验证输入
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setError('请填写所有密码字段');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('新密码和确认密码不一致');
      return;
    }

    if (newPassword.length < 6) {
      setError('新密码长度至少为6个字符');
      return;
    }

    try {
      // 获取用户列表
      const users = await StorageService.getUsers();

      // 检查当前密码是否正确
      const currentUser = users.find(user => user.username === userInfo.username);
      
      if (!currentUser) {
        setError('用户不存在');
        return;
      }

      // 验证当前密码
      if (currentPassword !== currentUser.password) {
        setError('当前密码错误');
        return;
      }

      // 更新用户密码
      const updatedUsers = users.map(user => 
        user.username === userInfo.username ? { ...user, password: newPassword } : user
      );
      await StorageService.saveUsers(updatedUsers);

      // 更新登录用户信息
      const updatedUser = { ...currentUser, password: newPassword };
      await StorageService.saveLoggedInUser(updatedUser);

      // 密码修改成功
      Alert.alert('成功', '密码修改成功', [
        {
          text: '确定',
          onPress: () => {
            setShowChangePasswordModal(false);
            // 重置表单
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setError('');
          }
        }
      ]);
    } catch (error) {
      logError('修改密码失败', error, 'ProfileScreen.handlePasswordSubmit');
      setError('修改密码失败，请重试');
    }
  };

  // 关闭修改密码模态框
  const handleCloseModal = () => {
    setShowChangePasswordModal(false);
    // 重置表单
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
  };

  const handleAbout = () => {
    Alert.alert(
      '关于',
      '器件管理系统 v1.0.0\n\n用于管理电子器件的库存和取用\n\n© 2026 器件管理系统'
    );
  };

  // 数据备份
  const handleBackupData = async () => {
    try {
      const backupData = await StorageService.exportAllData();
      const backupJson = JSON.stringify(backupData, null, 2);
      
      const fileName = `device_backup_${new Date().toISOString().slice(0, 10)}.json`;
      const fileUri = FileSystem.documentDirectory + fileName;
      
      await FileSystem.writeAsStringAsync(fileUri, backupJson);
      
      Alert.alert(
        '数据备份',
        `备份成功！\n\n文件: ${fileName}\n导出时间: ${backupData.exportDate}\n\n备份内容已保存，包含所有器件、用户和BOM数据。\n\n您可以在文件管理器中找到这个文件并分享给其他设备。`,
        [
          { text: '确定' }
        ]
      );
    } catch (error) {
      logError('备份数据失败', error, 'ProfileScreen.handleBackupData');
      Alert.alert('错误', `备份数据失败: ${error.message || '请重试'}`);
    }
  };

  // 数据恢复
  const handleRestoreData = async () => {
    Alert.alert(
      '数据恢复',
      '此操作将覆盖当前所有数据，确定要继续吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await DocumentPicker.getDocumentAsync({
                type: 'application/json',
                copyToCacheDirectory: true,
              });

              if (result.canceled) {
                return;
              }

              const fileUri = result.assets[0].uri;
              const fileContent = await FileSystem.readAsStringAsync(fileUri);
              const backupData = JSON.parse(fileContent);
              
              await StorageService.importAllData(backupData);
              
              Alert.alert(
                '成功',
                '数据恢复成功！\n\n应用将重启以加载新数据。',
                [
                  { 
                    text: '确定',
                    onPress: () => {
                      navigation.reset({
                        index: 0,
                        routes: [{ name: 'Login' }],
                      });
                    }
                  }
                ]
              );
            } catch (error) {
              logError('恢复数据失败', error, 'ProfileScreen.handleRestoreData');
              Alert.alert('错误', `恢复数据失败: ${error.message || '请检查文件格式并重试'}`);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>个人中心</Text>
      </View>
      
      <ScrollView style={styles.content}>
        <View style={styles.userInfoContainer}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>{userInfo.username.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.username}>{userInfo.username}</Text>
          <Text style={styles.role}>{userInfo.role}</Text>
        </View>
        
        <View style={styles.menuContainer}>
          <TouchableOpacity style={styles.menuItem} onPress={handleChangePassword}>
            <Text style={styles.menuText}>修改密码</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.menuItem} onPress={handleBackupData}>
            <Text style={styles.menuText}>数据备份</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.menuItem} onPress={handleRestoreData}>
            <Text style={styles.menuText}>数据恢复</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.menuItem} onPress={handleAbout}>
            <Text style={styles.menuText}>关于</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.menuItem, styles.lastMenuItem]} onPress={handleLogout}>
            <Text style={[styles.menuText, styles.logoutText]}>退出登录</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      
      {/* 修改密码模态框 */}
      <Modal
        visible={showChangePasswordModal}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseModal}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>修改密码</Text>
            
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>当前密码</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="请输入当前密码"
                  secureTextEntry={!currentPasswordVisible}
                />
                <TouchableOpacity 
                  style={styles.eyeButton}
                  onPress={() => setCurrentPasswordVisible(!currentPasswordVisible)}
                >
                  <Text style={styles.eyeIcon}>{currentPasswordVisible ? '👁️' : '👁️‍🗨️'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>新密码</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="请输入新密码"
                  secureTextEntry={!newPasswordVisible}
                />
                <TouchableOpacity 
                  style={styles.eyeButton}
                  onPress={() => setNewPasswordVisible(!newPasswordVisible)}
                >
                  <Text style={styles.eyeIcon}>{newPasswordVisible ? '👁️' : '👁️‍🗨️'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>确认密码</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="请再次输入新密码"
                  secureTextEntry={!confirmPasswordVisible}
                />
                <TouchableOpacity 
                  style={styles.eyeButton}
                  onPress={() => setConfirmPasswordVisible(!confirmPasswordVisible)}
                >
                  <Text style={styles.eyeIcon}>{confirmPasswordVisible ? '👁️' : '👁️‍🗨️'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={handleCloseModal}
              >
                <Text style={styles.cancelButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.submitButton]}
                onPress={handlePasswordSubmit}
              >
                <Text style={styles.submitButtonText}>确定</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  },
  userInfoContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: 'white',
    marginBottom: 16,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
  },
  username: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  role: {
    fontSize: 14,
    color: '#666',
  },
  menuContainer: {
    backgroundColor: 'white',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  lastMenuItem: {
    borderBottomWidth: 0,
  },
  menuText: {
    fontSize: 16,
  },
  menuArrow: {
    fontSize: 20,
    color: '#999',
  },
  logoutText: {
    color: '#FF3B30',
    fontWeight: 'bold',
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
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    color: '#333',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
  },
  eyeButton: {
    padding: 12,
    marginRight: 8,
  },
  eyeIcon: {
    fontSize: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#8E8E93',
    marginRight: 8,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    marginLeft: 8,
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ProfileScreen;