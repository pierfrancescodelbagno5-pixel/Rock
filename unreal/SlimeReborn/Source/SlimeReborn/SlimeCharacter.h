#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "SRBody.h"
#include "SlimeCharacter.generated.h"

class USpringArmComponent;
class UCameraComponent;
class UStaticMeshComponent;
class UMaterialInstanceDynamic;
class ASREnemy;
class ASRNPC;
class ASRHUD;
class ASRGameMode;
class ASRCompanion;

/**
 * The reincarnated hero. As a slime it can devour monsters with Predatore to steal their skills,
 * and use Mimetismo to take human or storm-wolf form. Other classes fight as humans.
 */
UCLASS()
class SLIMEREBORN_API ASlimeCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	ASlimeCharacter();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual void Landed(const FHitResult& Hit) override;

	// ---- Progression ----------------------------------------------------------------
	void ApplyClass(ESRClass NewClass, bool bFresh);
	void Recalc();
	float GetAttack() const;
	void GiveXP(float Amount);
	void GiveGold(int32 Amount);
	bool LearnSkill(ESRSkill Skill, bool bAnnounce = true);
	void UnlockForm(ESRForm NewForm);
	bool CanTransform() const;
	bool IsPredator() const;
	void SetForm(ESRForm NewForm, bool bFx);

	// ---- Combat ---------------------------------------------------------------------
	void ReceiveDamage(float Amount, AActor* Source);
	void Snare(float Seconds);
	void Shake(float Amplitude, float Duration);
	void OnDealtDamage(ASREnemy* Target, float Amount, bool bCrit = false);
	void AbsorbEnemy(ASREnemy* Enemy);
	float GetDefense() const;
	float GetCrit() const;

	// ---- Loot -----------------------------------------------------------------------
	bool PickUp(const FSRItem& Item);
	void EquipFromBag(int32 Index);
	int32 SellBag();
	static constexpr int32 BagSize = 27;

	// ---- UI hooks -------------------------------------------------------------------
	void Oracle(const FString& Text);
	void Toast(const FString& Big, const FString& Small);
	void Say(const FString& Speaker, const FString& Text);
	FString GetInteractPrompt() const;

	// ---- Travel ---------------------------------------------------------------------
	void TravelToGrace(int32 Index);
	void RespawnAtGrace();
	void TeleportPlayer(const FVector& Location);
	/** Teleport to an exact floor point (used inside the tower, where the terrain height does not apply). */
	void TeleportExact(const FVector& FloorPoint);

	// ---- State (read by HUD and save system) ------------------------------------------
	ESRClass ClassId = ESRClass::Emperor;
	ESRForm Form = ESRForm::Slime;
	int32 Level = 1;
	float XP = 0.f;
	int32 Gold = 50;
	int32 Potions = 3;
	int32 WeaponLevel = 0;
	int32 Absorbed = 0;
	float BonusHP = 0.f;
	float HP = 100.f, MaxHP = 100.f;
	float MP = 100.f, MaxMP = 100.f;
	float Stamina = 100.f, MaxStamina = 100.f;
	TArray<ESRSkill> Skills;
	int32 SelectedSkill = 0;
	bool bHasWolf = false;
	TArray<bool> GraceFound;
	int32 LastGrace = 0;
	bool bDead = false;
	float DeadTime = 0.f;
	bool bGraceMenu = false;
	bool bShowHelp = false;
	FString DialogSpeaker;
	FString DialogText;
	float DialogTime = 0.f;
	TWeakObjectPtr<ASREnemy> LockTarget;
	float Cooldowns[static_cast<int32>(ESRSkill::MAX)];
	float PotionCooldown = 0.f;
	TArray<FSRItem> Bag;
	FSRItem Equipped[3];
	bool bShowInventory = false;
	int32 InvPage = 0;
	bool bInDungeon = false;
	bool bSwimming = false;
	int32 SpouseCount = 0;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera") TObjectPtr<USpringArmComponent> CameraBoom;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera") TObjectPtr<UCameraComponent> FollowCamera;

private:
	// Input
	void MoveForward(float V);
	void MoveRight(float V);
	void Turn(float V);
	void TurnRate(float V);
	void LookUp(float V);
	void LookUpRate(float V);
	void Zoom(float V);
	void DoJump();
	void StopJump();
	void SprintOn();
	void SprintOff();
	void Dodge();
	void Attack();
	void Heavy();
	void Absorb();
	void CastSelected();
	void NextSkill();
	void Interact();
	void Transform();
	void UsePotion();
	void ToggleHelp();
	void ToggleLock();
	void ToggleInventory();
	void FireArrows(bool bHeavy);
	ASRCompanion* FindCompanion(float MaxDist) const;
	void MenuStart();
	void MenuContinue();
	void Num1() { OnNumber(1); }
	void Num2() { OnNumber(2); }
	void Num3() { OnNumber(3); }
	void Num4() { OnNumber(4); }
	void Num5() { OnNumber(5); }
	void Num6() { OnNumber(6); }
	void Num7() { OnNumber(7); }
	void Num8() { OnNumber(8); }
	void Num9() { OnNumber(9); }
	void OnNumber(int32 N);

	bool InMenu() const;
	bool CanAct() const;
	FVector InputDirection() const;

	// Combat
	void StartAttack(bool bHeavy);
	int32 MeleeHit(float Range, float MinDot, float Damage, float Knockback, bool bHeavy);
	void CastSkill(ESRSkill Skill);
	FVector AimDirection() const;
	ASREnemy* FindTarget(float MaxDist, float MinDot) const;
	ASREnemy* FindCorpse(float MaxDist) const;
	ASRNPC* FindNPC(float MaxDist) const;
	int32 FindGrace(float MaxDist) const;
	void HitStop(float Seconds);
	void Die();

	// Visuals
	void BuildVisuals();
	void BuildHuman();
	void UpdateAnimation(float Dt);
	void UpdateWorldChecks(float Dt);
	ASRHUD* GetSRHUD() const;
	ASRGameMode* GetGM() const;

	UPROPERTY() TObjectPtr<USceneComponent> VisualSpin;
	UPROPERTY() TObjectPtr<USceneComponent> SlimeRoot;
	UPROPERTY() TObjectPtr<USceneComponent> SlimeBody;
	UPROPERTY() TObjectPtr<USceneComponent> SlimeCrown;
	UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> SlimeEyes;
	UPROPERTY() TObjectPtr<UMaterialInstanceDynamic> SlimeMid;
	UPROPERTY() TObjectPtr<USceneComponent> HumanBase;
	UPROPERTY() TObjectPtr<USceneComponent> WolfBase;
	UPROPERTY() FSRRig HumanRig;
	UPROPERTY() FSRRig WolfRig;

	FLinearColor SlimeColor = FLinearColor(0.08f, 0.45f, 1.f);
	FVector2D MoveInput = FVector2D::ZeroVector;
	float BaseWalk = 520.f;
	bool bSprinting = false;
	float AttackTime = -1.f;
	float AttackDuration = 0.4f;
	float AttackHitAt = 0.15f;
	bool bAttackHit = false;
	bool bHeavyAttack = false;
	bool bQueuedAttack = false;
	int32 Combo = 0;
	float ComboWindow = 0.f;
	float DodgeTime = -1.f;
	float InvulnTime = 0.f;
	float SnareTime = 0.f;
	float StaminaDelay = 0.f;
	float ShakeAmp = 0.f;
	float ShakeTime = 0.f;
	float ShakeDur = 0.f;
	double HitStopEnd = 0.0;
	float Clock = 0.f;
	float WalkPhase = 0.f;
	float CastAnim = 0.f;
	float SpinAnim = 0.f;
	float AbsorbAnim = 0.f;
	float LandSquash = 0.f;
	float AirTime = 0.f;
	float HurtFlash = 0.f;
	float SinceHurt = 10.f;
	float TargetArm = 520.f;
	float ZoomMul = 1.f;
	float SafeTimer = 0.f;
	float RegionTimer = 0.f;
	float BagFullWarn = 0.f;
	FVector LastSafe = FVector::ZeroVector;
	FString LastRegion;
};
