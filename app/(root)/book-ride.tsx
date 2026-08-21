import { Image, Text, View } from "react-native";

import ConfirmBooking from "@/components/ConfirmBooking";
import RideLayout from "@/components/RideLayout";
import { icons } from "@/constants";
import { t } from "@/lib/i18n";
import { formatMRU, formatTime } from "@/lib/utils";
import { useDriverStore, useLocationStore } from "@/store";

const BookRide = () => {
  const { userAddress, destinationAddress } = useLocationStore();
  const { drivers, selectedDriver } = useDriverStore();

  const driverDetails = drivers?.filter(
    (driver) => +driver.id === selectedDriver,
  )[0];

  if (!driverDetails) {
    return (
      <RideLayout title={t("book.title")}>
        <View className="flex flex-col items-center justify-center mt-10">
          <Text className="text-lg font-JakartaSemiBold text-center">
            {t("book.noDriver")}
          </Text>
          <Text className="text-md text-general-200 text-center mt-2">
            {t("book.noDriverDesc")}
          </Text>
        </View>
      </RideLayout>
    );
  }

  return (
    <RideLayout title={t("book.title")}>
      <>
        <Text className="text-xl font-JakartaSemiBold mb-3">
          {t("confirm.rideInformation")}
        </Text>

        <View className="flex flex-col w-full items-center justify-center mt-10">
          <Image
            source={{ uri: driverDetails?.profile_image_url }}
            className="w-28 h-28 rounded-full"
          />

          <View className="flex flex-row items-center justify-center mt-5 space-x-2">
            <Text className="text-lg font-JakartaSemiBold">
              {driverDetails?.title}
            </Text>

            <View className="flex flex-row items-center space-x-0.5">
              <Image
                source={icons.star}
                className="w-5 h-5"
                resizeMode="contain"
              />
              <Text className="text-lg font-JakartaRegular">
                {driverDetails?.rating}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex flex-col w-full items-start justify-center py-3 px-5 rounded-3xl bg-general-600 mt-5">
          <View className="flex flex-row items-center justify-between w-full border-b border-white py-3">
            <Text className="text-lg font-JakartaRegular">
              {t("confirm.ridePrice")}
            </Text>
            <Text className="text-lg font-JakartaRegular text-[#0CC25F]">
              {formatMRU(driverDetails?.price!)}
            </Text>
          </View>

          <View className="flex flex-row items-center justify-between w-full border-b border-white py-3">
            <Text className="text-lg font-JakartaRegular">
              {t("confirm.pickupTime")}
            </Text>
            <Text className="text-lg font-JakartaRegular">
              {formatTime(driverDetails?.time!)}
            </Text>
          </View>

          <View className="flex flex-row items-center justify-between w-full py-3">
            <Text className="text-lg font-JakartaRegular">
              {t("confirm.carSeats")}
            </Text>
            <Text className="text-lg font-JakartaRegular">
              {driverDetails?.car_seats}
            </Text>
          </View>
        </View>

        <View className="flex flex-col w-full items-start justify-center mt-5">
          <View className="flex flex-row items-center justify-start mt-3 border-t border-b border-general-700 w-full py-3">
            <Image source={icons.to} className="w-6 h-6" />
            <Text className="text-lg font-JakartaRegular ml-2">
              {userAddress}
            </Text>
          </View>

          <View className="flex flex-row items-center justify-start border-b border-general-700 w-full py-3">
            <Image source={icons.point} className="w-6 h-6" />
            <Text className="text-lg font-JakartaRegular ml-2">
              {destinationAddress}
            </Text>
          </View>
        </View>

        <ConfirmBooking
          driverId={driverDetails?.id}
          rideTime={driverDetails?.time!}
          rideDistance={driverDetails?.distance ?? 0}
          amount={driverDetails?.price!}
        />
      </>
    </RideLayout>
  );
};

export default BookRide;
