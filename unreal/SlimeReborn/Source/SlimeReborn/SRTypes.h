#pragma once

#include "CoreMinimal.h"
#include "SRTypes.generated.h"

class AActor;
class UStaticMesh;
class UMaterialInterface;
class UMaterialInstanceDynamic;
class UStaticMeshComponent;
class USceneComponent;

UENUM(BlueprintType)
enum class ESRForm : uint8
{
	Slime,
	Human,
	Wolf
};

UENUM(BlueprintType)
enum class ESRClass : uint8
{
	Slime,
	Swordsman,
	Mage,
	Emperor,
	Archer
};

UENUM(BlueprintType)
enum class ESRSkill : uint8
{
	None,
	WaterBlade,
	Fireball,
	FireBreath,
	Thunder,
	Shockwave,
	BlackSlash,
	StickyThread,
	Regen,
	Devour,
	PiercingArrow,
	ArrowRain,
	MAX UMETA(Hidden)
};

UENUM(BlueprintType)
enum class ESREnemyKind : uint8
{
	Goblin,
	Wolf,
	Spider,
	Orc,
	Lizardman,
	Knight,
	OrcKing
};

UENUM(BlueprintType)
enum class ESRItemSlot : uint8
{
	Weapon,
	Armor,
	Ring
};

/** A piece of loot: weapon, armour or ring with random stats. */
USTRUCT(BlueprintType)
struct SLIMEREBORN_API FSRItem
{
	GENERATED_BODY()

	UPROPERTY() FString Name;
	UPROPERTY() ESRItemSlot Slot = ESRItemSlot::Weapon;
	/** 0 common, 1 uncommon, 2 rare, 3 epic, 4 legendary */
	UPROPERTY() uint8 Rarity = 0;
	UPROPERTY() int32 ItemLevel = 1;
	UPROPERTY() float Atk = 0.f;
	UPROPERTY() float Def = 0.f;
	UPROPERTY() float HP = 0.f;
	UPROPERTY() float MP = 0.f;
	UPROPERTY() float Crit = 0.f;
	UPROPERTY() int32 Value = 0;

	bool IsValid() const { return !Name.IsEmpty(); }
	float Score() const { return Atk * 2.f + Def * 1.5f + HP * 0.2f + MP * 0.15f + Crit * 100.f; }
};

/** Which parent material a primitive part uses. */
enum class ESRMat : uint8
{
	Lit,
	Fx,
	Slime,
	Water
};

struct FSRSkillInfo
{
	const TCHAR* Name;
	const TCHAR* Desc;
	float Mana;
	float Cooldown;
	FLinearColor Color;
};

struct FSRClassInfo
{
	const TCHAR* Name;
	const TCHAR* Title;
	const TCHAR* Desc;
	float HP;
	float MP;
	float Atk;
	bool bPredator;
};

struct FSREnemyInfo
{
	const TCHAR* Name;
	float HP;
	float Atk;
	float Speed;
	float Reach;
	float XP;
	float Scale;
	ESRSkill Grants;
};

struct FSRGrace
{
	FString Name;
	FVector Location;
};

struct FSRZone
{
	FString Name;
	FVector2D Center;
	float Radius;
	ESREnemyKind Kind;
	int32 Max;
	int32 Level;
};

struct FSRQuest
{
	FString Title;
	FString Desc;
	ESREnemyKind Target;
	int32 Need;
	int32 XP;
	int32 Gold;
	int32 Zone;
};

namespace SR
{
	constexpr float WorldHalf = 160000.f;
	constexpr float CityR = 11000.f;
	constexpr float CityZ = 500.f;
	constexpr float WaterZ = 0.f;
	constexpr float SnowZ = 6500.f;

	// ---- Procedural world --------------------------------------------------
	SLIMEREBORN_API float Noise2(float X, float Y);
	SLIMEREBORN_API float HeightAt(float X, float Y);
	SLIMEREBORN_API FVector NormalAt(float X, float Y);
	/** 0 plains, 1 forest, 2 desert, 3 mountains, 4 southern meadows, 5 swamp */
	SLIMEREBORN_API int32 BiomeAt(float X, float Y);
	SLIMEREBORN_API FString RegionName(const FVector& P);
	inline FVector Ground(float X, float Y, float Up = 0.f) { return FVector(X, Y, HeightAt(X, Y) + Up); }

	// ---- Game data ----------------------------------------------------------
	SLIMEREBORN_API const FSRSkillInfo& Skill(ESRSkill S);
	SLIMEREBORN_API const FSRClassInfo& Class(ESRClass C);
	SLIMEREBORN_API const FSREnemyInfo& Enemy(ESREnemyKind K);
	SLIMEREBORN_API const TArray<FSRGrace>& Graces();
	SLIMEREBORN_API const TArray<FSRZone>& Zones();
	SLIMEREBORN_API const TArray<FSRQuest>& Quests();
	SLIMEREBORN_API float XPForLevel(int32 Level);

	/** Number of playable classes and their order on the title screen. */
	constexpr int32 NumClasses = 5;
	SLIMEREBORN_API ESRClass ClassAt(int32 DisplayIndex);
	SLIMEREBORN_API int32 ClassDisplayIndex(ESRClass C);

	// ---- Loot ---------------------------------------------------------------
	/** Luck 0..1 pushes towards rarer items (bosses use ~0.7). */
	SLIMEREBORN_API FSRItem RollItem(int32 Level, float Luck);
	SLIMEREBORN_API const TCHAR* RarityName(uint8 Rarity);
	SLIMEREBORN_API FLinearColor RarityColor(uint8 Rarity);
	SLIMEREBORN_API FString ItemStats(const FSRItem& Item);

	// ---- Places ---------------------------------------------------------------
	/** The Tower of a Thousand Floors stands just outside the east gate. */
	const FVector2D TowerPos(2600.f, 14800.f);
	SLIMEREBORN_API FVector TowerDoor();

	// ---- Primitive art helpers (engine basic shapes + optional /Game/SR materials) ----
	SLIMEREBORN_API UStaticMesh* Mesh(const TCHAR* Shape);
	SLIMEREBORN_API UMaterialInterface* Material(ESRMat Mat);
	SLIMEREBORN_API UMaterialInstanceDynamic* MakeMID(UObject* Outer, const FLinearColor& Color, ESRMat Mat = ESRMat::Lit, float Glow = 0.f);
	SLIMEREBORN_API UStaticMeshComponent* AddPart(AActor* Owner, USceneComponent* Parent, const TCHAR* Shape,
		const FVector& Loc, const FVector& Scale, const FLinearColor& Color,
		const FRotator& Rot = FRotator::ZeroRotator, ESRMat Mat = ESRMat::Lit, float Glow = 0.f);
	SLIMEREBORN_API USceneComponent* AddPivot(AActor* Owner, USceneComponent* Parent, const FVector& Loc, const FRotator& Rot = FRotator::ZeroRotator);
	/** sRGB hex (0xRRGGBB) to linear colour. */
	SLIMEREBORN_API FLinearColor Hex(uint32 RGB);
}
