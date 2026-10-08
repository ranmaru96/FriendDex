import './sentry';
import { SplashScreen } from 'expo-router';

void SplashScreen.preventAutoHideAsync();

require('expo-router/entry');
