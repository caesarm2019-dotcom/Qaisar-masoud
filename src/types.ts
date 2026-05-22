/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Ad {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  images: string[];
  location: { lat: number; lng: number; city: string };
  sellerId: string;
  sellerName: string;
  contactMethod: 'whatsapp' | 'chat';
  whatsappNumber?: string;
  createdAt: any;
  status: 'active' | 'sold' | 'deleted';
  isFeatured?: boolean;
  watchers?: string[];
}

export interface UserProfile {
  displayName: string;
  photoURL: string;
  email: string;
  whatsappNumber?: string;
  phoneNumber?: string;
  address?: string;
  birthDate?: string;
  fcmToken?: string;
  isVerified?: boolean;
  notificationPrefs?: {
    newListings: boolean;
    priceDrops: boolean;
    messages: boolean;
    offers: boolean;
  };
  favoriteCategories?: string[];
}

export interface Conversation {
  id: string;
  participants: string[];
  adId: string;
  adTitle: string;
  adImage?: string;
  lastMessage: string;
  lastMessageAt: any;
  unreadCount?: Record<string, number>;
  typing?: Record<string, boolean>;
  otherUser?: {
    displayName: string;
    photoURL: string;
  };
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  type?: 'text' | 'image' | 'voice' | 'offer';
  audioUrl?: string;
  imageUrl?: string;
  offerAmount?: number;
  offerStatus?: 'pending' | 'accepted' | 'rejected' | 'countered';
  read?: boolean;
  createdAt: any;
  isOptimistic?: boolean;
  localId?: string;
  localTimestamp?: number;
}
