#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SRTypes.h"
#include "SRLoot.generated.h"

class UStaticMeshComponent;
class UPointLightComponent;

/** A dropped item: a glowing orb with a beam of light in its rarity colour. Walk over it to pick it up. */
UCLASS()
class SLIMEREBORN_API ASRLoot : public AActor
{
	GENERATED_BODY()

public:
	ASRLoot();

	static ASRLoot* Drop(UWorld* World, const FVector& At, const FSRItem& Item);

	virtual void Tick(float DeltaSeconds) override;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Loot") FSRItem Item;

private:
	void Init(const FSRItem& InItem);

	UPROPERTY() TObjectPtr<USceneComponent> Root;
	UPROPERTY() TObjectPtr<UStaticMeshComponent> Orb;
	UPROPERTY() TObjectPtr<UStaticMeshComponent> Beam;
	UPROPERTY() TObjectPtr<UPointLightComponent> Light;
	FVector Base = FVector::ZeroVector;
	float Clock = 0.f;
};
