import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

interface Friend {
  id: string;
  username: string;
  phone: string;
  email?: string | null;
  xp: number;
  nights_out: number;
  bars_hit: number;
  rank_title: string;
  created_at: string;
}

interface FriendRequest {
  id: string;
  from_user_id: string;
  from_username: string;
  from_user_rank: string;
  created_at: string;
}

interface XPActivity {
  id: string;
  type: 'visit_new_bar' | 'participate_event' | 'bring_friend' | 'complete_night_out' | 'special_achievement' | 'live_music' | 'featured_drink' | 'bar_game' | 'photo_taken' | 'shots' | 'beers' | 'beer_towers' | 'funnels' | 'shotguns' | 'pool_games' | 'dart_games' | 'drunk_scale_submission' | 'like_bar' | 'check_in';
  xpAwarded: number;
  timestamp: string;
  description: string;
}

interface UserProfile {
  id: string;
  username: string;
  phone: string;
  email?: string | null;
  xp: number;
  nights_out: number;
  bars_hit: number;
  drunk_scale_ratings: number[];
  last_night_out_date?: string;
  last_drunk_scale_date?: string;
  profile_picture?: string;
  friends: Friend[];
  friend_requests: FriendRequest[];
  xp_activities: XPActivity[];
  visited_bars: string[];
  total_shots: number;
  total_beers: number;
  total_beer_towers: number;
  total_funnels: number;
  total_shotguns: number;
  pool_games_won: number;
  dart_games_won: number;
  photos_taken: number;
  has_completed_onboarding: boolean;
  created_at: string;
  updated_at: string;
}

interface UserProfileState {
  profile: UserProfile | null;
  isLoading: boolean;
  isUpdating: boolean;
  profileReady: boolean;
  loadProfile: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  incrementNightsOut: () => Promise<void>;
  incrementBarsHit: () => Promise<void>;
  addDrunkScaleRating: (rating: number) => Promise<void>;
  getAverageDrunkScale: () => number;
  canIncrementNightsOut: () => boolean;
  canSubmitDrunkScale: () => boolean;
  setProfilePicture: (uri: string) => Promise<void>;
  awardXP: (type: XPActivity['type'], description: string, venueId?: string) => Promise<void>;
  searchUserByUsername: (username: string) => Promise<Friend | null>;
  sendFriendRequest: (username: string) => Promise<boolean>;
  acceptFriendRequest: (requestId: string) => Promise<boolean>;
  declineFriendRequest: (requestId: string) => Promise<boolean>;
  loadFriendRequests: () => Promise<void>;
  loadFriends: () => Promise<void>;
  checkAndResetDrunkScaleIfNeeded: () => void;
  setProfileReady: (ready: boolean) => void;
  syncStatsFromDailyStats: () => Promise<void>;
  incrementPhotosTaken: () => Promise<void>;
}

const XP_VALUES = {
  visit_new_bar: 15,
  participate_event: 50,
  bring_friend: 30,
  complete_night_out: 20,
  special_achievement: 75,
  live_music: 40,
  featured_drink: 20,
  bar_game: 35,
  photo_taken: 10,
  shots: 5,
  beers: 5,
  beer_towers: 15,
  funnels: 10,
  shotguns: 10,
  pool_games: 15,
  dart_games: 15,
  drunk_scale_submission: 25,
  like_bar: 5,
  check_in: 10,
};

const isSameDay = (date1: string, date2: string): boolean => {
  try {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  } catch {
    return false;
  }
};

const hasPassedMidnight = (lastSubmissionDate?: string): boolean => {
  if (!lastSubmissionDate) return true;
  
  try {
    const lastSubmission = new Date(lastSubmissionDate);
    const now = new Date();
    
    // Check if it's a different day
    if (lastSubmission.getDate() !== now.getDate() || 
        lastSubmission.getMonth() !== now.getMonth() || 
        lastSubmission.getFullYear() !== now.getFullYear()) {
      return true;
    }
    
    return false;
  } catch {
    return true;
  }
};

export const useUserProfileStore = create<UserProfileState>()(
  persist(
    (set, get) => ({
      profile: null,
      isLoading: false,
      isUpdating: false,
      profileReady: false,
      
      setProfileReady: (ready: boolean) => {
        set({ profileReady: ready });
      },
      
      loadProfile: async () => {
        const state = get();
        if (state.isLoading || state.isUpdating) {
          console.log('🔄 Profile load already in progress, skipping...');
          return;
        }
        
        try {
          set({ isLoading: true, profileReady: false });
          console.log('🔄 Starting profile load...');
          
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            console.log('🔄 No authenticated user found');
            set({ isLoading: false, profile: null, profileReady: false });
            return;
          }

          console.log('🔄 Loading profile for authenticated user:', user.id);

          // Use phone-first logic for profile lookup
          let query = supabase.from('profiles').select('*');
          
          if (user.phone) {
            query = query.eq('phone', user.phone);
          } else if (user.email) {
            query = query.eq('email', user.email);
          } else {
            query = query.eq('id', user.id);
          }

          const { data: profileData, error } = await query.single();

          if (error) {
            console.error('Error loading profile:', error);
            
            // If profile doesn't exist, create it
            if (error.code === 'PGRST116') {
              console.log('🔄 Profile not found, creating new profile...');
              const newProfileData = {
                id: user.id,
                username: user.user_metadata?.username || `guest_${Math.floor(Math.random() * 100000)}`,
                phone: user.phone || '',
                email: user.email || null,
                xp: 0,
                nights_out: 0,
                bars_hit: 0,
                drunk_scale_ratings: [],
                total_shots: 0,
                total_beers: 0,
                total_beer_towers: 0,
                total_funnels: 0,
                total_shotguns: 0,
                pool_games_won: 0,
                dart_games_won: 0,
                photos_taken: 0,
                visited_bars: [],
                xp_activities: [],
                has_completed_onboarding: false,
              };
              
              const { data: newProfile, error: createError } = await supabase
                .from('profiles')
                .insert(newProfileData)
                .select('*')
                .single();
              
              if (!createError && newProfile) {
                console.log('✅ New profile created successfully');
                // Load friends and friend requests
                await Promise.all([
                  get().loadFriends(),
                  get().loadFriendRequests()
                ]);

                set({ 
                  profile: {
                    ...newProfile,
                    friends: get().profile?.friends || [],
                    friend_requests: get().profile?.friend_requests || [],
                  }, 
                  isLoading: false,
                  profileReady: true
                });
                return;
              } else {
                console.error('Failed to create new profile:', createError);
              }
            }
            
            set({ isLoading: false, profile: null, profileReady: false });
            return;
          }

          console.log('✅ Profile loaded successfully:', profileData.username);

          // Load friends and friend requests
          await Promise.all([
            get().loadFriends(),
            get().loadFriendRequests()
          ]);

          // Sync stats from daily_stats table
          await get().syncStatsFromDailyStats();

          set({ 
            profile: {
              ...profileData,
              friends: get().profile?.friends || [],
              friend_requests: get().profile?.friend_requests || [],
            }, 
            isLoading: false,
            profileReady: true
          });
        } catch (error) {
          console.error('Error loading profile:', error);
          set({ isLoading: false, profile: null, profileReady: false });
        }
      },

      syncStatsFromDailyStats: async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          // Get lifetime stats from daily_stats table
          const { data: dailyStats, error } = await supabase
            .from('daily_stats')
            .select('*')
            .eq('user_id', user.id);

          if (error) {
            console.warn('Error syncing stats from daily_stats:', error);
            return;
          }

          if (!dailyStats || dailyStats.length === 0) return;

          // Calculate totals
          const totals = dailyStats.reduce((acc, day) => ({
            total_beers: acc.total_beers + (day.beers || 0),
            total_shots: acc.total_shots + (day.shots || 0),
            total_beer_towers: acc.total_beer_towers + (day.beer_towers || 0),
            total_funnels: acc.total_funnels + (day.funnels || 0),
            total_shotguns: acc.total_shotguns + (day.shotguns || 0),
            pool_games_won: acc.pool_games_won + (day.pool_games_won || 0),
            dart_games_won: acc.dart_games_won + (day.dart_games_won || 0),
            nights_out: acc.nights_out + 1, // Each day with stats counts as a night out
          }), {
            total_beers: 0,
            total_shots: 0,
            total_beer_towers: 0,
            total_funnels: 0,
            total_shotguns: 0,
            pool_games_won: 0,
            dart_games_won: 0,
            nights_out: 0,
          });

          // Update profile with synced stats
          await get().updateProfile(totals);

          console.log('✅ Stats synced from daily_stats table');
        } catch (error) {
          console.warn('Error syncing stats from daily_stats:', error);
        }
      },

      updateProfile: async (updates) => {
        const state = get();
        if (!state.profile) {
          console.error('❌ No profile available for update');
          return;
        }

        try {
          console.log('🔄 Updating profile with:', updates);
          
          // Update local state immediately for better UX
          set((currentState) => ({
            profile: currentState.profile ? { ...currentState.profile, ...updates } : null
          }));

          // Try to update in Supabase if available
          try {
            const { error } = await supabase
              .from('profiles')
              .update({
                ...updates,
                updated_at: new Date().toISOString()
              })
              .eq('id', state.profile.id);

            if (error) {
              console.warn('Error updating profile in Supabase:', error);
              // Don't revert local changes - keep them for offline functionality
            } else {
              console.log('✅ Profile updated in Supabase successfully');
            }
          } catch (supabaseError) {
            console.warn('Supabase not available, keeping local changes:', supabaseError);
          }

          // Update achievements with new stats
          if (typeof window !== 'undefined' && (window as any).__achievementStore) {
            const achievementStore = (window as any).__achievementStore;
            if (achievementStore?.getState) {
              const { checkAndUpdateMultiLevelAchievements } = achievementStore.getState();
              const currentProfile = get().profile;
              if (currentProfile) {
                checkAndUpdateMultiLevelAchievements({
                  totalBeers: currentProfile.total_beers || 0,
                  totalShots: currentProfile.total_shots || 0,
                  totalBeerTowers: currentProfile.total_beer_towers || 0,
                  totalScoopAndScores: 0, // Not tracked in daily stats
                  totalFunnels: currentProfile.total_funnels || 0,
                  totalShotguns: currentProfile.total_shotguns || 0,
                  poolGamesWon: currentProfile.pool_games_won || 0,
                  dartGamesWon: currentProfile.dart_games_won || 0,
                  barsHit: currentProfile.bars_hit || 0,
                  nightsOut: currentProfile.nights_out || 0,
                });
              }
            }
          }
        } catch (error) {
          console.error('Error updating profile:', error);
        }
      },

      checkAndResetDrunkScaleIfNeeded: () => {
        // Simplified - just check if it's a new day
        const { profile } = get();
        if (!profile) return;

        if (hasPassedMidnight(profile.last_drunk_scale_date)) {
          get().updateProfile({
            last_drunk_scale_date: undefined,
          });
        }
      },
      
      incrementNightsOut: async () => {
        const { profile } = get();
        if (!profile) return;

        const today = new Date().toISOString();
        
        if (!profile.last_night_out_date || !isSameDay(profile.last_night_out_date, today)) {
          const newNightsOut = profile.nights_out + 1;
          
          await get().updateProfile({
            nights_out: newNightsOut,
            last_night_out_date: today
          });
          
          // Award XP for night out
          await get().awardXP('complete_night_out', 'Completed a night out');
        }
      },
      
      incrementBarsHit: async () => {
        const { profile } = get();
        if (!profile) return;

        const newBarsHit = (profile.bars_hit || 0) + 1;
        
        await get().updateProfile({
          bars_hit: newBarsHit
        });
        
        // Award XP for bar visit
        await get().awardXP('visit_new_bar', 'Visited a new bar');
      },

      incrementPhotosTaken: async () => {
        const { profile } = get();
        if (!profile) return;

        const newPhotosTaken = (profile.photos_taken || 0) + 1;
        
        await get().updateProfile({
          photos_taken: newPhotosTaken
        });
        
        // Award XP for photo taken
        await get().awardXP('photo_taken', 'Took a photo');
      },
      
      addDrunkScaleRating: async (rating: number) => {
        const { profile } = get();
        if (!profile) {
          console.error('❌ No profile available for drunk scale rating');
          return;
        }

        const today = new Date().toISOString();
        const currentRatings = profile.drunk_scale_ratings || [];
        
        await get().updateProfile({
          drunk_scale_ratings: [...currentRatings, rating],
          last_drunk_scale_date: today
        });
        
        // Award XP for drunk scale submission
        await get().awardXP('drunk_scale_submission', `Submitted drunk scale rating: ${rating}/5`);
      },
      
      getAverageDrunkScale: () => {
        const { profile } = get();
        if (!profile || !profile.drunk_scale_ratings || profile.drunk_scale_ratings.length === 0) return 0;
        
        const sum = profile.drunk_scale_ratings.reduce((acc, rating) => acc + rating, 0);
        return Math.round((sum / profile.drunk_scale_ratings.length) * 10) / 10;
      },
      
      awardXP: async (type, description, venueId) => {
        const { profile } = get();
        if (!profile) {
          console.warn('❌ No profile available for XP award');
          return;
        }

        const xpAmount = XP_VALUES[type];
        if (!xpAmount) {
          console.warn('Invalid XP type:', type);
          return;
        }

        console.log(`🎯 Awarding ${xpAmount} XP for ${type}: ${description}`);
        
        const activityId = Math.random().toString(36).substr(2, 9);
        
        const newActivity: XPActivity = {
          id: activityId,
          type,
          xpAwarded: xpAmount,
          timestamp: new Date().toISOString(),
          description,
        };
        
        const currentXPActivities = profile.xp_activities || [];
        
        let updates: Partial<UserProfile> = {
          xp: (profile.xp || 0) + xpAmount,
          xp_activities: [...currentXPActivities, newActivity],
        };
        
        switch (type) {
          case 'visit_new_bar':
            if (venueId && !profile.visited_bars?.includes(venueId)) {
              updates.visited_bars = [...(profile.visited_bars || []), venueId];
              updates.bars_hit = (profile.bars_hit || 0) + 1;
            }
            break;
          case 'photo_taken':
            updates.photos_taken = (profile.photos_taken || 0) + 1;
            break;
          case 'pool_games':
            updates.pool_games_won = (profile.pool_games_won || 0) + 1;
            break;
          case 'dart_games':
            updates.dart_games_won = (profile.dart_games_won || 0) + 1;
            break;
        }
        
        await get().updateProfile(updates);
        console.log(`✅ XP awarded successfully. New total: ${(profile.xp || 0) + xpAmount}`);
      },
      
      canIncrementNightsOut: () => {
        const { profile } = get();
        if (!profile) return true;
        
        const today = new Date().toISOString();
        return !profile.last_night_out_date || !isSameDay(profile.last_night_out_date, today);
      },

      canSubmitDrunkScale: () => {
        const { profile } = get();
        if (!profile) return true;
        
        // Check if we need to reset first
        get().checkAndResetDrunkScaleIfNeeded();
        
        // Use 24-hour check for drunk scale
        return hasPassedMidnight(profile.last_drunk_scale_date);
      },

      setProfilePicture: async (uri: string) => {
        try {
          // For now, just store the URI directly
          // In a real app, you'd upload to Supabase Storage first
          await get().updateProfile({ profile_picture: uri });
          console.log('✅ Profile picture updated successfully');
        } catch (error) {
          console.error('Error setting profile picture:', error);
        }
      },

      searchUserByUsername: async (username: string): Promise<Friend | null> => {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('id, username, phone, email, xp, nights_out, bars_hit, created_at')
            .eq('username', username)
            .single();

          if (error || !data) {
            return null;
          }

          return {
            id: data.id,
            username: data.username,
            phone: data.phone,
            email: data.email,
            xp: data.xp,
            nights_out: data.nights_out,
            bars_hit: data.bars_hit,
            rank_title: 'Bar Explorer',
            created_at: data.created_at,
          };
        } catch (error) {
          console.error('Error searching user:', error);
          return null;
        }
      },

      sendFriendRequest: async (username: string): Promise<boolean> => {
        const { profile } = get();
        if (!profile) return false;

        try {
          // First find the user by username
          const targetUser = await get().searchUserByUsername(username);
          if (!targetUser) return false;

          // Check if already friends
          const { data: existingFriend } = await supabase
            .from('friends')
            .select('id')
            .or(`and(user_id.eq.${profile.id},friend_id.eq.${targetUser.id}),and(user_id.eq.${targetUser.id},friend_id.eq.${profile.id})`)
            .single();

          if (existingFriend) return false;

          // Check if request already exists
          const { data: existingRequest } = await supabase
            .from('friend_requests')
            .select('id')
            .or(`and(from_user_id.eq.${profile.id},to_user_id.eq.${targetUser.id}),and(from_user_id.eq.${targetUser.id},to_user_id.eq.${profile.id})`)
            .single();

          if (existingRequest) return false;

          // Send friend request
          const { error } = await supabase
            .from('friend_requests')
            .insert({
              from_user_id: profile.id,
              to_user_id: targetUser.id,
            });

          return !error;
        } catch (error) {
          console.error('Error sending friend request:', error);
          return false;
        }
      },

      acceptFriendRequest: async (requestId: string): Promise<boolean> => {
        const { profile } = get();
        if (!profile) return false;

        try {
          // Get the friend request
          const { data: request, error: requestError } = await supabase
            .from('friend_requests')
            .select('from_user_id, to_user_id')
            .eq('id', requestId)
            .eq('to_user_id', profile.id)
            .single();

          if (requestError || !request) return false;

          // Create friendship (both directions)
          const { error: friendError } = await supabase
            .from('friends')
            .insert([
              { user_id: profile.id, friend_id: request.from_user_id },
              { user_id: request.from_user_id, friend_id: profile.id }
            ]);

          if (friendError) return false;

          // Update request status
          const { error: updateError } = await supabase
            .from('friend_requests')
            .update({ status: 'accepted', responded_at: new Date().toISOString() })
            .eq('id', requestId);

          if (updateError) return false;

          // Reload friends and requests
          await Promise.all([
            get().loadFriends(),
            get().loadFriendRequests()
          ]);

          return true;
        } catch (error) {
          console.error('Error accepting friend request:', error);
          return false;
        }
      },

      declineFriendRequest: async (requestId: string): Promise<boolean> => {
        const { profile } = get();
        if (!profile) return false;

        try {
          const { error } = await supabase
            .from('friend_requests')
            .update({ status: 'declined', responded_at: new Date().toISOString() })
            .eq('id', requestId)
            .eq('to_user_id', profile.id);

          if (error) return false;

          await get().loadFriendRequests();
          return true;
        } catch (error) {
          console.error('Error declining friend request:', error);
          return false;
        }
      },

      loadFriendRequests: async () => {
        const { profile } = get();
        if (!profile) return;

        try {
          const { data, error } = await supabase
            .from('friend_requests')
            .select(`
              id,
              from_user_id,
              created_at,
              from_user:profiles!friend_requests_from_user_id_fkey(username, xp)
            `)
            .eq('to_user_id', profile.id)
            .eq('status', 'pending');

          if (error) {
            console.error('Error loading friend requests:', error);
            return;
          }

          const friendRequests: FriendRequest[] = (data || []).map((request: any) => ({
            id: request.id,
            from_user_id: request.from_user_id,
            from_username: request.from_user?.username || 'Unknown',
            from_user_rank: 'Bar Explorer',
            created_at: request.created_at,
          }));

          set((state) => ({
            profile: state.profile ? {
              ...state.profile,
              friend_requests: friendRequests
            } : null
          }));
        } catch (error) {
          console.error('Error loading friend requests:', error);
        }
      },

      loadFriends: async () => {
        const { profile } = get();
        if (!profile) return;

        try {
          const { data, error } = await supabase
            .from('friends')
            .select(`
              id,
              friend_id,
              created_at,
              friend:profiles!friends_friend_id_fkey(id, username, phone, email, xp, nights_out, bars_hit, created_at)
            `)
            .eq('user_id', profile.id);

          if (error) {
            console.error('Error loading friends:', error);
            return;
          }

          const friends: Friend[] = (data || []).map((friendship: any) => {
            const friend = friendship.friend;
            return {
              id: friend?.id || '',
              username: friend?.username || 'Unknown',
              phone: friend?.phone || '',
              email: friend?.email || null,
              xp: friend?.xp || 0,
              nights_out: friend?.nights_out || 0,
              bars_hit: friend?.bars_hit || 0,
              rank_title: 'Bar Explorer',
              created_at: friendship.created_at,
            };
          });

          set((state) => ({
            profile: state.profile ? {
              ...state.profile,
              friends
            } : null
          }));
        } catch (error) {
          console.error('Error loading friends:', error);
        }
      },
    }),
    {
      name: 'user-profile-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Only persist non-sensitive data
        profile: state.profile ? {
          id: state.profile.id,
          username: state.profile.username,
          phone: state.profile.phone,
          xp: state.profile.xp,
          nights_out: state.profile.nights_out,
          bars_hit: state.profile.bars_hit,
          total_shots: state.profile.total_shots,
          total_beers: state.profile.total_beers,
          total_beer_towers: state.profile.total_beer_towers,
          total_funnels: state.profile.total_funnels,
          total_shotguns: state.profile.total_shotguns,
          pool_games_won: state.profile.pool_games_won,
          dart_games_won: state.profile.dart_games_won,
          xp_activities: state.profile.xp_activities,
          visited_bars: state.profile.visited_bars,
          has_completed_onboarding: state.profile.has_completed_onboarding,
          created_at: state.profile.created_at,
          updated_at: state.profile.updated_at,
          drunk_scale_ratings: state.profile.drunk_scale_ratings,
          last_drunk_scale_date: state.profile.last_drunk_scale_date,
          profile_picture: state.profile.profile_picture,
          photos_taken: state.profile.photos_taken,
        } : null,
      }),
    }
  )
);

// Store reference for cross-store access
if (typeof window !== 'undefined') {
  (window as any).__userProfileStore = useUserProfileStore;
}