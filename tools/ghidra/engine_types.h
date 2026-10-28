#ifndef NANCY_REDRAWN_ENGINE_TYPES_H
#define NANCY_REDRAWN_ENGINE_TYPES_H

/*
 * Experimental on-disk observations, NOT proven runtime structures.
 * Do not apply these to function parameters until disassembly confirms their use.
 * The count/lookup-table interpretation in the earlier research log is unverified.
 */
#pragma pack(push, 1)
typedef struct {
  unsigned char signature[24];
  unsigned short version_major;
  unsigned short version_minor;
  unsigned char count_and_flags_unverified[4];
} NR_CifHeaderObserved;

typedef struct {
  unsigned char name_candidate[32];
  unsigned char unknown_20[3];
  unsigned int payload_offset_candidate;
  unsigned char unknown_27[50];
  unsigned int stored_length_candidate;
  unsigned char unknown_5d;
} NR_CifRecordObserved;
#pragma pack(pop)

#endif
