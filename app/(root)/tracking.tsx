import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Image, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";

import RideLayout from "@/components/RideLayout";
import { icons } from "@/constants";
import { t } from "@/lib/i18n";
import { useRide, useCancelRide } from "@/lib/api-client";
import { useRideWebSocket } from "@/hooks/useRideWebSocket";
import { formatMRU } from "@/lib/utils";

const directionsAPI = process.env.EXPO_PUBLIC_DIRECTIONS_API_KEY;

const Tracking = () => {
  const { rideId } = router.getParams<{ rideId: string }>();
  const numericRideId = Number(rideId);

  const { data: ride, refetch, isLoading } = useRide(numericRideId);
  const cancelMutation = useCancelRide();

  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const { isConnected, subscribe, unsubscribe } = useRideWebSocket({
    rideId: numericRideId,
    onRideStatus: (data) => {
      refetch();
      if (data.status === "TRIP_COMPLETED") {
        router.push(`/(root)/payment?rideId=${numericRideId}`);
      } else if (
        data.status === "CUSTOMER_CANCELLED" ||
        data.status === "DRIVER_CANCELLED" ||
        data.status === "NO_DRIVER_FOUND"
      ) {
        router.replace("/(root)/(tabs)/home");
      }
    },
    onDriverLocation: (data) => {
      setDriverLocation({
        latitude: data.latitude,
        longitude: data.longitude,
      });
    },
    onError: (message) => {
      console.log("[tracking] WS error:", message);
    },
  });

  useEffect(() => {
    subscribe(numericRideId);
    return () => unsubscribe(numericRideId);
  }, [subscribe, unsubscribe, numericRideId]);

  useEffect(() => {
    if (ride && !isLoading) {
      if (ride.status === "TRIP_COMPLETED") {
        router.push(`/(root)/payment?rideId=${numericRideId}`);
      }
    }
  }, [ride, isLoading, numericRideId]);

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync(numericRideId);
      router.replace("/(root)/(tabs)/home");
    } catch (error: any) {
      Alert.alert(t("common.error"), error.message || t("rides.cancelFailed"));
    }
  };

  const canCancel = ride && [
    "REQUESTED",
    "SEARCHING_DRIVER",
    "DRIVER_ASSIGNED",
    "DRIVER_ARRIVING",
    "DRIVER_AT_PICKUP",
  ].includes(ride.status) && ride.payment_status === "pending";

  const region = ride
    ? {
        latitude: (ride.origin_latitude + ride.destination_latitude) / 2,
        longitude: (ride.origin_longitude + ride.destination_longitude) / 2,
        latitudeDelta: Math.abs(ride.origin_latitude - ride.destination_latitude) * 1.5 + 0.01,
        longitudeDelta: Math.abs(ride.origin_longitude - ride.destination_longitude) * 1.5 + 0.01,
      }
    : {
        latitude: 18.0858,
        longitude: -15.9785,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 justify-center items-center">
          <Text className="text-lg">{t("findride.searching")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!ride) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 justify-center items-center">
          <Text>{t("common.error")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusText = t(`rides.status.${ride.status}`, undefined, {});
  const isActiveTrip = ["DRIVER_ARRIVING", "DRIVER_AT_PICKUP", "TRIP_STARTED"].includes(ride.status);

  return (
    <RideLayout title={statusText} snapPoints={["65%"]}>
      <View className="flex-1">
        <MapView
          provider={PROVIDER_DEFAULT}
          className="w-full h-full"
          tintColor="black"
          mapType="mutedStandard"
          showsPointsOfInterest={false}
          initialRegion={region}
          showsUserLocation={true}
          userInterfaceStyle="light"
        >
          {driverLocation && (
            <Marker
              key="driver"
              coordinate={driverLocation}
              title={t("confirm.selectedDriver")}
              image={icons.car}
            />
          )}

          <Marker
            key="pickup"
            coordinate={{ latitude: ride.origin_latitude, longitude: ride.origin_longitude }}
            title={t("findride.from")}
            image={icons.to}
          />

          <Marker
            key="destination"
            coordinate={{ latitude: ride.destination_latitude, longitude: ride.destination_longitude }}
            title={t("findride.to")}
            image={icons.pin}
          />

          {directionsAPI && (
            <MapViewDirections
              origin={{
                latitude: driverLocation?.latitude ?? ride.origin_latitude,
                longitude: driverLocation?.longitude ?? ride.origin_longitude,
              }}
              destination={{
                latitude: ride.destination_latitude,
                longitude: ride.destination_longitude,
              }}
              apikey={directionsAPI}
              strokeColor="#0286FF"
              strokeWidth={3}
            />
          )}
        </MapView>

        <View className="absolute bottom-0 left-0 right-0 p-5 bg-white border-t border-gray-200">
          {ride.driver_id && ride.driver && (
            <View className="flex flex-row items-center justify-between mb-4 p-4 bg-gray-50 rounded-xl">
              <View className="flex flex-row items-center gap-3">
                <Image
                  source={{ uri: ride.driver.profile_image_url }}
                  className="w-14 h-14 rounded-full"
                />
                <View>
                  <Text className="text-lg font-JakartaBold">
                    {ride.driver.first_name} {ride.driver.last_name}
                  </Text>
                  <View className="flex flex-row items-center gap-1 mt-1">
                    <Image source={icons.star} className="w-4 h-4" tintColor="#FFD700" />
                    <Text className="text-sm text-gray-600">{ride.driver.rating}</Text>
                    <Text className="text-sm text-gray-400 mx-1">·</Text>
                    <Image source={icons.car} className="w-4 h-4" tintColor="gray" />
                    <Text className="text-sm text-gray-600">{ride.driver.car_seats} {t("confirm.carSeats")}</Text>
                  </View>
                </View>
              </View>

              <View className="flex flex-row items-center gap-2">
                <TouchableOpacity className="p-2 bg-green-100 rounded-full">
                  <Image source={icons.chat} className="w-5 h-5" tintColor="green" />
                </TouchableOpacity>
                <TouchableOpacity className="p-2 bg-blue-100 rounded-full">
                  <Image source={icons.phone} className="w-5 h-5" tintColor="blue" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View className="flex flex-row items-center justify-between">
            <View>
              <Text className="text-sm text-gray-500">{t("confirm.ridePrice")}</Text>
              <Text className="text-2xl font-JakartaExtraBold text-green-600">
                {formatMRU(ride.fare_price)}
              </Text>
            </View>

            <View className="flex flex-row items-center gap-2">
              {canCancel && (
                <TouchableOpacity
                  onPress={() => setShowCancelConfirm(true)}
                  className="px-4 py-2 border border-red-500 rounded-lg"
                >
                  <Text className="text-sm font-JakartaSemiBold text-red-500">
                    {t("rides.cancel")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {showCancelConfirm && (
          <View className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
            <View className="bg-white rounded-2xl p-6 w-[90%] max-w-md">
              <Text className="text-xl font-JakartaBold text-center mb-2">
                {t("rides.cancelConfirmTitle", undefined, {})}
              </Text>
              <Text className="text-center text-gray-600 mb-6">
                {t("rides.cancelConfirmDesc", undefined, {})}
              </Text>
              <View className="flex flex-row gap-3">
                <TouchableOpacity
                  onPress={() => setShowCancelConfirm(false)}
                  className="flex-1 py-3 px-4 border border-gray-300 rounded-lg items-center justify-center"
                >
                  <Text className="font-JakartaSemiBold text-gray-700">
                    {t("common.no", undefined, "No")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCancel}
                  className="flex-1 py-3 px-4 bg-red-500 rounded-lg items-center justify-center"
                >
                  <Text className="font-JakartaSemiBold text-white">
                    {t("common.yes", undefined, "Yes")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {!isConnected && (
          <View className="absolute top-10 left-5 right-5 z-50">
            <View className="bg-yellow-500 px-4 py-2 rounded-lg flex items-center justify-center gap-2">
              <Text className="text-white text-sm font-JakartaMedium">
                {t("findride.reconnecting")}
              </Text>
            </View>
          </View>
        )}
      </RideLayout>
    );
  );
};

export default Tracking;