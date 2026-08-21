import { useAuth, useUser } from "@clerk/clerk-expo";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import RideCard from "@/components/RideCard";
import { images } from "@/constants";
import { fetchAPI, useFetch } from "@/lib/fetch";
import { t } from "@/lib/i18n";
import { Ride } from "@/types/type";

const Rides = () => {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const {
    data: recentRides,
    loading,
    refetch,
  } = useFetch<Ride[]>(`/(api)/ride/${user?.id}`);

  const handleCancel = async (rideId: number) => {
    if (cancellingId !== null) return;
    setCancellingId(rideId);
    try {
      const token = await getToken();
      await fetchAPI(`/(api)/ride/${rideId}/cancel`, {
        method: "POST",
        token: token ?? undefined,
      });
      Alert.alert(t("rides.cancelled"));
      refetch();
    } catch (err) {
      Alert.alert(
        t("common.error"),
        err instanceof Error ? err.message : t("rides.cancelFailed"),
      );
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <FlatList
        data={recentRides}
        renderItem={({ item }) => (
          <RideCard
            ride={item}
            onCancel={handleCancel}
            cancelling={cancellingId === item.ride_id}
          />
        )}
        keyExtractor={(item, index) => index.toString()}
        className="px-5"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingBottom: 100,
        }}
        ListEmptyComponent={() => (
          <View className="flex flex-col items-center justify-center">
            {!loading ? (
              <>
                <Image
                  source={images.noResult}
                  className="w-40 h-40"
                  alt="No recent rides found"
                  resizeMode="contain"
                />
                <Text className="text-sm">{t("rides.empty")}</Text>
              </>
            ) : (
              <ActivityIndicator size="small" color="#000" />
            )}
          </View>
        )}
        ListHeaderComponent={
          <>
            <Text className="text-2xl font-JakartaBold my-5">
              {t("rides.title")}
            </Text>
          </>
        }
      />
    </SafeAreaView>
  );
};

export default Rides;
