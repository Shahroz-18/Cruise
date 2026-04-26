import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { signInAnonymously } from 'firebase/auth';
import { auth } from './firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HomeScreen from './screens/HomeScreen';
import PartyScreen from './screens/PartyScreen';
import JoinPartyScreen from './screens/JoinPartyScreen';
import MapScreen from './screens/MapScreen';
import ProfileScreen from './screens/ProfileScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [loading, setLoading] = useState(true);
  const [savedPartyCode, setSavedPartyCode] = useState(null);

  useEffect(() => {
  const bootstrap = async () => {
    try {
      await signInAnonymously(auth);
      const uid = auth.currentUser.uid;
      await AsyncStorage.setItem('cruiseUid', uid);   // <-- new

      const code = await AsyncStorage.getItem('currentPartyCode');
      if (code) setSavedPartyCode(code);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  bootstrap();
}, []);

  if (loading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{ headerStyle: { backgroundColor: '#0d0d0f', borderBottomWidth: 1, borderBottomColor: 'rgba(255,107,0,0.25)' }, headerTintColor: '#FF6B00' }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
          initialParams={{ savedPartyCode }}
        />
        <Stack.Screen name="Party" component={PartyScreen} options={{ title: 'Your Party' }} />
        <Stack.Screen name="JoinParty" component={JoinPartyScreen} options={{ title: 'Join Party' }} />
        <Stack.Screen name="Map" component={MapScreen} options={{ title: 'Live Map' }} />
        <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}