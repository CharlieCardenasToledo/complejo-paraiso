import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';

export const appConfig: ApplicationConfig = {
  providers: [provideZoneChangeDetection({ eventCoalescing: true }), provideRouter(routes), provideFirebaseApp(() => initializeApp({"projectId":"complejo-paraiso","appId":"1:572747406183:web:2ccd25787ff30964bbadc2","storageBucket":"complejo-paraiso.firebasestorage.app","apiKey":"AIzaSyBC3JiEftn1mhp5FsPrWwvpyZ7AZ8cVbdg","authDomain":"complejo-paraiso.firebaseapp.com","messagingSenderId":"572747406183"})), provideAuth(() => getAuth()), provideFirestore(() => getFirestore())]
};
