#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "SRSaveGame.generated.h"

UCLASS()
class SLIMEREBORN_API USRSaveGame : public USaveGame
{
	GENERATED_BODY()

public:
	UPROPERTY() uint8 ClassId = 3;
	UPROPERTY() uint8 Form = 0;
	UPROPERTY() int32 Level = 1;
	UPROPERTY() float XP = 0.f;
	UPROPERTY() int32 Gold = 0;
	UPROPERTY() int32 Potions = 3;
	UPROPERTY() int32 WeaponLevel = 0;
	UPROPERTY() int32 Absorbed = 0;
	UPROPERTY() float BonusHP = 0.f;
	UPROPERTY() TArray<uint8> Skills;
	UPROPERTY() bool bHasWolf = false;
	UPROPERTY() TArray<bool> Graces;
	UPROPERTY() int32 LastGrace = 0;
	UPROPERTY() int32 QuestIndex = 0;
	UPROPERTY() int32 QuestProgress = 0;
	UPROPERTY() bool bQuestActive = false;
	UPROPERTY() float TimeOfDay = 9.f;
	UPROPERTY() int32 Kills = 0;
};
