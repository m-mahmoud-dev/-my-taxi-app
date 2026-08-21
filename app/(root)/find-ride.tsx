import { router } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

import CustomButton from "@/components/CustomButton";
import GoogleTextInput from "@/components/GoogleTextInput";
import RideLayout from "@/components/RideLayout";
import { icons } from "@/constants";
import { useCreateRide } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import { useLocationStore } from "@/store";

const FindRide = () => {
  const {
    userAddress,
    destinationAddress,
    userLatitude,
    userLongitude,
    destinationLatitude,
    destinationLongitude,
    setDestinationLocation,
    setUserLocation,
  } = useLocationStore();

  const [isSearching, setIsSearching] = useState(false);

  const createRideMutation = useCreateRide();

  const handleFindRide = async () => {
    if (!userLatitude || !userLongitude) {
      Alert.alert(t("book.missingPickup"), t("book.missingPickupDesc"));
      return;
    }
    if (!destinationLatitude || !destinationLongitude) {
      Alert.alert(
        t("book.missingDestination"),
        t("book.missingDestinationDesc"),
      );
      return;
    }

    setIsSearching(true);

    try {
      const result = await createRideMutation.mutateAsync({
        origin_address: userAddress!,
        destination_address: destinationAddress!,
        origin_latitude: userLatitude,
        origin_longitude: userLongitude,
        destination_latitude: destinationLatitude,
        destination_longitude: destinationLongitude,
        payment_method: "cash",
        vehicle_type: "standard",
      });

      const rideId = result.data.ride_id;
      router.push(`/(root)/matching?rideId=${rideId}`);
    } catch (error: any) {
      Alert.alert(t("book.bookingFailed"), error.message || t("book.tryAgain"));
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <RideLayout title={t("findride.title")}>
      <View className="my-3">
        <Text className="text-lg font-JakartaSemiBold mb-3">
          {t("findride.from")}
        </Text>

        <GoogleTextInput
          icon={icons.target}
          initialLocation={userAddress!}
          containerStyle="bg-neutral-100"
          textInputBackgroundColor="#f5f5f5"
          handlePress={(location) => setUserLocation(location)}
        />
      </View>

      <View className="my-3">
        <Text className="text-lg font-JakartaSemiBold mb-3">
          {t("findride.to")}
        </Text>

        <GoogleTextInput
          icon={icons.map}
          initialLocation={destinationAddress!}
          containerStyle="bg-neutral-100"
          textInputBackgroundColor="transparent"
          handlePress={(location) => setDestinationLocation(location)}
        />
      </View>

      <CustomButton
        title={isSearching ? t("findride.searching") : t("findride.button")}
        onPress={handleFindRide}
        className="mt-5"
        disabled={isSearching}
      />
    </RideLayout>
  );
};

export default FindRide;
