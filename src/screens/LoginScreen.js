import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import StorageService from '../services/StorageService';

const LoginScreen = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const handleLogin = async () => {
    try {
      const users = await StorageService.getUsers();
      
      const user = users.find(u => u.username === username && u.password === password);
      
      if (user) {
        await StorageService.saveLoggedInUser(user);
        navigation.navigate('MainTabs', {
          isAdmin: user.isAdmin || false,
          username: user.username
        });
      } else {
        Alert.alert('登录失败', '用户名或密码错误');
      }
    } catch (error) {
      console.error('登录失败:', error);
      Alert.alert('错误', '登录失败，请重试');
    }
  };

  const handleRegister = async () => {
    try {
      if (!username.trim() || !password.trim()) {
        Alert.alert('注册失败', '用户名和密码不能为空');
        return;
      }
      
      if (password !== confirmPassword) {
        Alert.alert('注册失败', '两次输入的密码不一致');
        return;
      }
      
      const users = await StorageService.getUsers();
      
      if (users.some(u => u.username === username)) {
        Alert.alert('注册失败', '用户名已存在');
        return;
      }
      
      const newUser = {
        username,
        password,
        isAdmin: isAdmin
      };
      
      users.push(newUser);
      await StorageService.saveUsers(users);
      
      Alert.alert('注册成功', '请使用新账号登录', [
        { text: '确定', onPress: () => setIsRegistering(false) }
      ]);
    } catch (error) {
      console.error('注册失败:', error);
      Alert.alert('错误', '注册失败，请重试');
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title}>器件管理系统</Text>
        <Text style={styles.subtitle}>{isRegistering ? '注册账号' : '请登录'}</Text>
        
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>用户名</Text>
          <TextInput
            style={styles.input}
            placeholder="请输入用户名"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
        </View>
        
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>密码</Text>
          <View style={styles.passwordInputContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="请输入密码"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity 
              style={styles.eyeIcon} 
              onPress={() => setShowPassword(!showPassword)}
            >
              <Text style={styles.eyeIconText}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {isRegistering && (
          <>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>确认密码</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="请再次输入密码"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity 
                  style={styles.eyeIcon} 
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Text style={styles.eyeIconText}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>用户角色</Text>
              <View style={styles.roleContainer}>
                <TouchableOpacity 
                  style={[styles.roleButton, !isAdmin && styles.roleButtonActive]}
                  onPress={() => setIsAdmin(false)}
                >
                  <Text style={[styles.roleButtonText, !isAdmin && styles.roleButtonTextActive]}>普通用户</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.roleButton, isAdmin && styles.roleButtonActive]}
                  onPress={() => setIsAdmin(true)}
                >
                  <Text style={[styles.roleButtonText, isAdmin && styles.roleButtonTextActive]}>管理员</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={styles.loginButton} 
            onPress={isRegistering ? handleRegister : handleLogin}
          >
            <Text style={styles.loginButtonText}>{isRegistering ? '注册' : '登录'}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.registerButton} 
            onPress={() => setIsRegistering(!isRegistering)}
          >
            <Text style={styles.registerButtonText}>
              {isRegistering ? '已有账号？点击登录' : '没有账号？点击注册'}
            </Text>
          </TouchableOpacity>
        </View>
        
        {!isRegistering && (
          <View style={styles.demoContainer}>
            <Text style={styles.demoTitle}>演示账号</Text>
            <Text style={styles.demoText}>管理员: admin / admin</Text>
            <Text style={styles.demoText}>普通用户: user / user</Text>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1976d2',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
  },
  eyeIcon: {
    position: 'absolute',
    right: 12,
  },
  eyeIconText: {
    fontSize: 20,
  },
  buttonContainer: {
    marginTop: 40,
  },
  loginButton: {
    backgroundColor: '#5eafffff',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  loginButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  registerButton: {
    backgroundColor: '#55cd59ff',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  registerButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  demoContainer: {
    marginTop: 40,
    padding: 16,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
  },
  demoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976d2',
    marginBottom: 8,
  },
  demoText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  roleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  roleButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    marginHorizontal: 5,
  },
  roleButtonActive: {
    backgroundColor: '#1976d2',
    borderColor: '#1976d2',
  },
  roleButtonText: {
    fontSize: 16,
    color: '#333',
  },
  roleButtonTextActive: {
    color: 'white',
    fontWeight: '600',
  },
});

export default LoginScreen;