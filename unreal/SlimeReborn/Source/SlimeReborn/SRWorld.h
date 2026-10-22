#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SRTypes.h"
#include "SRWorld.generated.h"

class UDirectionalLightComponent;
class USkyAtmosphereComponent;
class USkyLightComponent;
class UExponentialHeightFogComponent;
class UVolumetricCloudComponent;
class UPostProcessComponent;
class UPointLightComponent;
class UHierarchicalInstancedStaticMeshComponent;
class UMaterialInstanceDynamic;

/**
 * Builds the whole open world at runtime from code: sky, sun & moon, Lumen-lit
 * procedural terrain, sea, forests, rocks, grass, the royal city of Altheria,
 * landmarks and Sites of Grace. Also runs the day/night cycle.
 */
UCLASS()
class SLIMEREBORN_API ASRWorld : public AActor
{
	GENERATED_BODY()

public:
	ASRWorld();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	/** Real minutes for a full day. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Slime Reborn")
	float DayLengthMinutes = 26.f;

	/** 0..24 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Slime Reborn")
	float TimeOfDay = 8.5f;

	/** Terrain density: quads per chunk side (10x10 chunks). Lower = faster. */
	UPROPERTY(EditAnywhere, Category = "Slime Reborn")
	int32 TerrainQuadsPerChunk = 48;

	/** Vegetation density multiplier (0.25 .. 2). */
	UPROPERTY(EditAnywhere, Category = "Slime Reborn")
	float FoliageDensity = 1.f;

	bool IsNight() const { return TimeOfDay < 6.f || TimeOfDay > 19.5f; }
	float GetTimeOfDay() const { return TimeOfDay; }

	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> Root;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UDirectionalLightComponent> Sun;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UDirectionalLightComponent> Moon;
	UPROPERTY(VisibleAnywhere) TObjectPtr<USkyAtmosphereComponent> Atmosphere;
	UPROPERTY(VisibleAnywhere) TObjectPtr<USkyLightComponent> SkyLight;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UExponentialHeightFogComponent> Fog;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UVolumetricCloudComponent> Clouds;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UPostProcessComponent> PostFX;

private:
	void BuildTerrain();
	void BuildWater();
	void BuildNature();
	void BuildCity();
	void BuildLandmarks();
	void BuildGraces();
	void SpawnCitizens();
	void UpdateSky();

	UHierarchicalInstancedStaticMeshComponent* MakeHISM(const TCHAR* Shape, const FLinearColor& Color, bool bCollide,
		float CullEnd = 0.f, ESRMat Mat = ESRMat::Lit, float Glow = 0.f);
	void AddBox(UHierarchicalInstancedStaticMeshComponent* H, const FTransform& Parent, const FVector& Loc, const FVector& SizeCm, const FRotator& Rot = FRotator::ZeroRotator);
	void AddLamp(const FVector& Base, bool bLight);

	UPROPERTY() TArray<TObjectPtr<UPointLightComponent>> NightLights;
	UPROPERTY() TArray<TObjectPtr<UMaterialInstanceDynamic>> NightGlow;
	UPROPERTY() TObjectPtr<UHierarchicalInstancedStaticMeshComponent> LampHISM;
	UPROPERTY() TObjectPtr<UHierarchicalInstancedStaticMeshComponent> PostHISM;
	bool bLastNight = false;
	bool bCitizensSpawned = false;
};
