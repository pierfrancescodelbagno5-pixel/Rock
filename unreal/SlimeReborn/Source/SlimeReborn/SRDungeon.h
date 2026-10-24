#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SRTypes.h"
#include "SRDungeon.generated.h"

class UHierarchicalInstancedStaticMeshComponent;
class UStaticMeshComponent;
class UPointLightComponent;
class UMaterialInstanceDynamic;
class ASREnemy;
class ASlimeCharacter;

/**
 * The Tower of a Thousand Floors: an endless dungeon built far off the map.
 * Every floor is a 3x3 maze of rooms; clear every monster to open the portal upwards.
 * Every fifth floor holds a champion and becomes a checkpoint.
 */
UCLASS()
class SLIMEREBORN_API ASRDungeon : public AActor
{
	GENERATED_BODY()

public:
	ASRDungeon();

	virtual void Tick(float DeltaSeconds) override;

	void Enter(ASlimeCharacter* Player);
	void Exit(ASlimeCharacter* Player, bool bTeleportOut);
	void NextFloor(ASlimeCharacter* Player);

	bool IsActive() const { return bActive; }
	bool IsCleared() const { return bCleared; }
	int32 EnemiesLeft() const;
	/** Floor the next visit starts from (last checkpoint). */
	int32 StartFloor() const { return FMath::Max(1, (BestFloor / 5) * 5 + 1); }

	/** 0 = none, 1 = portal up, 2 = exit portal */
	int32 PortalNear(const FVector& Location) const;

	int32 Floor = 0;
	int32 BestFloor = 0;

	static const FVector Origin;

private:
	void Build(int32 InFloor);
	void Clear();
	FVector CellCenter(int32 I, int32 J) const;
	void SpawnEnemy(ESREnemyKind Kind, int32 Level, const FVector& At, float Elite);

	UPROPERTY() TObjectPtr<USceneComponent> Root;
	UPROPERTY() TObjectPtr<UHierarchicalInstancedStaticMeshComponent> FloorH;
	UPROPERTY() TObjectPtr<UHierarchicalInstancedStaticMeshComponent> WallH;
	UPROPERTY() TObjectPtr<UHierarchicalInstancedStaticMeshComponent> PillarH;
	UPROPERTY() TObjectPtr<UHierarchicalInstancedStaticMeshComponent> CeilH;
	UPROPERTY() TObjectPtr<UHierarchicalInstancedStaticMeshComponent> GlowH;
	UPROPERTY() TObjectPtr<UStaticMeshComponent> UpPortal;
	UPROPERTY() TObjectPtr<UStaticMeshComponent> OutPortal;
	UPROPERTY() TArray<TObjectPtr<UPointLightComponent>> Lights;
	UPROPERTY() TArray<TObjectPtr<UMaterialInstanceDynamic>> Mids;
	TArray<TWeakObjectPtr<ASREnemy>> Spawned;
	FVector UpPos = FVector::ZeroVector;
	FVector OutPos = FVector::ZeroVector;
	FVector StartPos = FVector::ZeroVector;
	bool bActive = false;
	bool bCleared = false;
	bool bBuilt = false;
	float Clock = 0.f;
};
