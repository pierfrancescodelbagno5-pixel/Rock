#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SRFx.generated.h"

class UStaticMeshComponent;
class UPointLightComponent;
class UMaterialInstanceDynamic;

UENUM()
enum class ESRFxKind : uint8
{
	Burst,
	Ring,
	Pillar,
	Slash,
	Vortex,
	Spark
};

/** Short-lived glowing effect made from a primitive + a point light (no assets needed). */
UCLASS()
class SLIMEREBORN_API ASRFx : public AActor
{
	GENERATED_BODY()

public:
	ASRFx();

	static ASRFx* Spawn(UWorld* World, ESRFxKind InKind, const FVector& At, const FLinearColor& InColor, float InSize,
		float InDuration = 0.45f, const FRotator& Rot = FRotator::ZeroRotator);

	virtual void Tick(float DeltaSeconds) override;

private:
	void Init(ESRFxKind InKind, const FLinearColor& InColor, float InSize, float InDuration);

	UPROPERTY() TObjectPtr<USceneComponent> Root;
	UPROPERTY() TObjectPtr<UStaticMeshComponent> Mesh;
	UPROPERTY() TObjectPtr<UStaticMeshComponent> Mesh2;
	UPROPERTY() TObjectPtr<UPointLightComponent> Light;
	UPROPERTY() TObjectPtr<UMaterialInstanceDynamic> Mid;
	UPROPERTY() TObjectPtr<UMaterialInstanceDynamic> Mid2;
	ESRFxKind Kind = ESRFxKind::Burst;
	FLinearColor Color = FLinearColor::White;
	float Size = 100.f;
	float Duration = 0.4f;
	float Age = 0.f;
};
