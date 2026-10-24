#pragma once

#include "CoreMinimal.h"
#include "SRTypes.h"
#include "SRBody.generated.h"

class USceneComponent;
class UStaticMeshComponent;
class UMaterialInstanceDynamic;

/** A procedural rig made from primitive parts, animated from code. */
USTRUCT()
struct SLIMEREBORN_API FSRRig
{
	GENERATED_BODY()

	UPROPERTY() TObjectPtr<USceneComponent> Root = nullptr;
	UPROPERTY() TObjectPtr<USceneComponent> Torso = nullptr;
	UPROPERTY() TObjectPtr<USceneComponent> Head = nullptr;
	UPROPERTY() TObjectPtr<USceneComponent> ArmL = nullptr;
	UPROPERTY() TObjectPtr<USceneComponent> ArmR = nullptr;
	UPROPERTY() TObjectPtr<USceneComponent> LegL = nullptr;
	UPROPERTY() TObjectPtr<USceneComponent> LegR = nullptr;
	UPROPERTY() TObjectPtr<USceneComponent> Hand = nullptr;
	UPROPERTY() TObjectPtr<USceneComponent> Tail = nullptr;
	UPROPERTY() TArray<TObjectPtr<USceneComponent>> Legs;
	UPROPERTY() TArray<TObjectPtr<UMaterialInstanceDynamic>> Mids;
	TArray<FLinearColor> BaseColors;
	TArray<FRotator> LegRest;
	bool bQuadruped = false;
	bool bSpider = false;

	bool IsValid() const { return Root != nullptr; }
	/** Procedural locomotion. Phase in radians, Amount 0..1 (speed). */
	void Walk(float Phase, float Amount, float Time);
	/** 0 = normal colours, 1 = full flash colour. */
	void Flash(float Amount, const FLinearColor& FlashColor = FLinearColor::White);
	void SetVisible(bool bVisible);
	void Track(UStaticMeshComponent* Part, const FLinearColor& Color);
};

struct FSRHumanStyle
{
	FLinearColor Skin = SR::Hex(0xe8c4a0);
	FLinearColor Shirt = SR::Hex(0x4a5a7a);
	FLinearColor Pants = SR::Hex(0x3a3028);
	FLinearColor Hair = SR::Hex(0x3a2a1a);
	FLinearColor Boots = SR::Hex(0x2a1f18);
	FLinearColor Accent = SR::Hex(0xc9a227);
	FLinearColor Cape = SR::Hex(0x7a1c1c);
	FLinearColor Eyes = FLinearColor(0.02f, 0.02f, 0.02f);
	float Height = 1.f;
	float Bulk = 1.f;
	bool bLongHair = false;
	bool bSkirt = false;
	bool bHelmet = false;
	bool bCape = false;
	bool bBeard = false;
	bool bPointyEars = false;
	bool bTusks = false;
	bool bSnout = false;
	bool bTail = false;
	bool bCrown = false;
	bool bGlowEyes = false;
	bool bBald = false;
	/** 0 none, 1 sword, 2 spear, 3 staff, 4 club, 5 axe, 6 greatsword, 7 bow */
	int32 Weapon = 0;
};

namespace SR
{
	SLIMEREBORN_API FSRRig BuildHumanoid(AActor* Owner, USceneComponent* Parent, const FSRHumanStyle& S);
	SLIMEREBORN_API FSRRig BuildWolf(AActor* Owner, USceneComponent* Parent, const FLinearColor& Fur, const FLinearColor& Eyes, float Size);
	SLIMEREBORN_API FSRRig BuildSpider(AActor* Owner, USceneComponent* Parent, const FLinearColor& Body, float Size);
	SLIMEREBORN_API void AddWeapon(AActor* Owner, FSRRig& Rig, int32 Weapon, const FLinearColor& Accent);
}
