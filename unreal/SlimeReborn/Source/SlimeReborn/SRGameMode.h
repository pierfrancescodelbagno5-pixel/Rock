#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "SRTypes.h"
#include "SRGameMode.generated.h"

class ASlimeCharacter;
class ASREnemy;
class ASRWorld;

/** Builds the world, runs the title menu, quests, monster spawning and saving. */
UCLASS()
class SLIMEREBORN_API ASRGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	ASRGameMode();

	virtual void InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage) override;
	virtual AActor* ChoosePlayerStart_Implementation(AController* Player) override;
	virtual void Tick(float DeltaSeconds) override;

	void StartGame(bool bContinue);
	void SaveProgress();
	bool LoadProgress(ASlimeCharacter* P);
	FString GuildTalk(ASlimeCharacter* P);
	void OnEnemyKilled(ASREnemy* Enemy);
	void OnRest();
	const FSRQuest* ActiveQuest() const;
	ASRWorld* GetSRWorld() const { return SRWorld; }

	bool bInMenu = true;
	int32 MenuClass = 3;
	bool bHasSave = false;
	int32 QuestIndex = 0;
	int32 QuestProgress = 0;
	bool bQuestActive = false;
	int32 Kills = 0;
	TWeakObjectPtr<ASREnemy> Boss;

	static const FVector GuildSpot;
	static const FVector SpawnSpot;

private:
	struct FZoneState
	{
		TArray<TWeakObjectPtr<ASREnemy>> Alive;
		float Cooldown = 0.f;
	};

	void UpdateSpawns();
	ASlimeCharacter* GetPlayer() const;

	TArray<FZoneState> ZoneStates;
	UPROPERTY() TObjectPtr<ASRWorld> SRWorld;
	UPROPERTY() TObjectPtr<AActor> StartSpot;
	float SpawnTimer = 0.f;
	bool bAbsorbHint = false;
};
