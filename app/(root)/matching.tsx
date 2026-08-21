import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ActivityIndicator, Image, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import RideLayout from "@/components/RideLayout";
import { icons } from "@/constants";
import { t } from "@/lib/i18n";
import { useRide, useCancelRide } from "@/lib/api-client";
import { useRideWebSocket } from "@/hooks/useRideWebSocket";

const MATCHING_TIMEOUT_MS = 60_000; // 60 seconds
const POLL_INTERVAL_MS = 3_000; // 3 seconds

const Matching = () => {
  const { rideId } = router.getParams<{ rideId: string }>();
  const numericRideId = Number(rideId);

  const { data: ride, refetch, isLoading } = useRide(numericRideId);
  const cancelMutation = useCancelRide();

  const [matchingStartTime, setMatchingStartTime] = useState(Date.now());
  const [timeRemaining, setTimeRemaining] = useState(MATCHING_TIMEOUT_MS);
  const [driverAssigned, setDriverAssigned] = useState(false);

  const { isConnected, subscribe, unsubscribe } = useRideWebSocket({
    rideId: numericRideId,
    onRideStatus: (data) => {
      refetch();
      if (data.status === "DRIVER_ASSIGNED") {
        setDriverAssigned(true);
        setTimeout(() => {
          router.push(`/(root)/tracking?rideId=${numericRideId}`);
        }, 1000);
      } else if (data.status === "NO_DRIVER_FOUND" || data.status === "CUSTOMER_CANCELLED") {
        router.replace("/(root)/(tabs)/home");
      }
    },
    onError: (message) => {
      console.log("[matching] WS error:", message);
    },
  });

  useEffect(() => {
    subscribe(numericRideId);
    return () => unsubscribe(numericRideId);
  }, [subscribe, unsubscribe, numericRideId]);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (driverAssigned) return;

      const elapsed = Date.now() - matchingStartTime;
      const remaining = Math.max(0, MATCHING_TIMEOUT_MS - elapsed);
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        return;
      }

      await refetch();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [driverAssigned, matchingStartTime, refetch]);

  useEffect(() => {
    if (ride && !driverAssigned) {
      if (ride.status === "DRIVER_ASSIGNED") {
        setDriverAssigned(true);
        setTimeout(() => {
          router.push(`/(root)/tracking?rideId=${numericRideId}`);
        }, 1000);
      } else if (ride.status === "NO_DRIVER_FOUND") {
        Alert.alert(
          t("rides.status.NO_DRIVER_FOUND"),
          t("rides.noDriverFoundDesc", undefined, { time: formatTime(timeRemaining / 1000) }),
        );
        router.replace("/(root)/(tabs)/home");
      } else if (ride.status === "CUSTOMER_CANCELLED") {
        router.replace("/(root)/(tabs)/home");
      }
    }
  }, [ride, driverAssigned, timeRemaining, numericRideId]);

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync(numericRideId);
      router.replace("/(root)/(tabs)/home");
    } catch (error: any) {
      Alert.alert(t("common.error"), error.message || t("rides.cancelFailed"));
    }
  };

  const progress = Math.max(0, Math.min(1, (MATCHING_TIMEOUT_MS - timeRemaining) / MATCHING_TIMEOUT_MS));

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <ActivityIndicator size="large" color="#0286FF" />
      </SafeAreaView>
    );
  }

  return (
    <RideLayout title={t("findride.searching")} snapPoints={["60%"]}>
      <View className="flex-1 flex flex-col items-center justify-center px-5">
        <View className="w-full flex flex-col items-center">
          <View className="relative w-40 h-40 mb-8">
            <Image
              source={icons.car}
              className="w-full h-full"
              resizeMode="contain"
            />
            <View className="absolute inset-0 flex items-center justify-center">
              <View className="w-40 h-40 border-4 border-primary-500/30 rounded-full" />
              <View
                className={`absolute w-40 h-40 border-4 border-primary-500 rounded-full`}
                style={{
                  transform: [{ rotate: "-90deg" }],
                }}
              >
                <View
                  className="absolute inset-0 border-4 border-transparent border-t-primary-500 rounded-full"
                  style={{
                    transform: [{ rotate: `${progress * 360}deg` }],
                  }}
                />
              </View>
            </View>
          </View>

          <Text className="text-2xl font-JakartaBold text-center mb-2">
            {t("findride.searching")}
          </Text>

          <Text className="text-lg text-gray-500 text-center mb-6">
            {t("findride.lookingForDriver")}
          </Text>

          <View className="w-full bg-gray-200 rounded-full h-3 overflow-hidden mb-6">
            <View
              className="bg-primary-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </View>

          <Text className="text-sm text-gray-500 text-center mb-6">
            {formatTime(Math.ceil(timeRemaining / 1000))} {t("findride.remaining")}
          </Text>

          {ride && ride.driver_id && (
            <View className="w-full bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
              <View className="flex flex-row items-center justify-center gap-3">
                <Image source={icons.checkmark} className="w-6 h-6" tintColor="green" />
                <Text className="text-lg font-JakartaSemiBold text-green-700">
                  {t("findride.driverFound")}
                </Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            onPress={handleCancel}
            disabled={driverAssigned}
            className="w-full py-3 px-6 border border-red-500 rounded-xl flex items-center justify-center gap-2"
          >
            <Image source={icons.close} className="w-5 h-5" tintColor="red" />
            <Text className="text-lg font-JakartaSemiBold text-red-500">
              {t("rides.cancel")}
            </Text>
          </TouchableOpacity>

          {!isConnected && (
            <Text className="text-xs text-gray-400 text-center mt-4">
              {t("findride.reconnecting")}
            </Text>
          )}
        </View>
        </View>
      </RideLayout>
    );
  );
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default Matching;